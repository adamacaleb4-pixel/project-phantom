
import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

function JournalAttachments({ selectedDate }) {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadFiles()
  }, [selectedDate])

  async function loadFiles() {
    const { data, error } = await supabase
      .from('journal_attachments')
      .select('*')
      .eq('journal_date', selectedDate)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      return
    }

    const filesWithUrls = await Promise.all(
      (data || []).map(async file => {
        const { data: signedData, error: signedError } =
          await supabase.storage
            .from('journal-media')
            .createSignedUrl(file.file_path, 3600)

        if (signedError) {
          console.error(signedError)
        }

        return {
          ...file,
          signedUrl: signedData?.signedUrl
        }
      })
    )

    setFiles(filesWithUrls)
  }

  async function handleUpload(event) {
    const selectedFiles = Array.from(event.target.files || [])

    if (!selectedFiles.length) return

    setUploading(true)
    setMessage('')

    try {
      const { data: { user }, error: userError } =
        await supabase.auth.getUser()

      if (userError) throw userError
      if (!user) throw new Error('Please sign in first.')

      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/pdf'
      ]

      for (const file of selectedFiles) {
        if (!allowedTypes.includes(file.type)) {
          throw new Error(`${file.name}: unsupported file type.`)
        }

        if (file.size > 10 * 1024 * 1024) {
          throw new Error(`${file.name}: maximum file size is 10 MB.`)
        }

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')

        const filePath =
          `${user.id}/${selectedDate}/${crypto.randomUUID()}-${safeName}`

        const { error: uploadError } = await supabase.storage
          .from('journal-media')
          .upload(filePath, file)

        if (uploadError) throw uploadError

        const { error: recordError } = await supabase
          .from('journal_attachments')
          .insert({
            user_id: user.id,
            journal_date: selectedDate,
            file_path: filePath,
            file_name: file.name,
            mime_type: file.type,
            size_bytes: file.size
          })

        if (recordError) {
          await supabase.storage
            .from('journal-media')
            .remove([filePath])

          throw recordError
        }
      }

      setMessage('Upload successful!')
      await loadFiles()

    } catch (error) {
      setMessage(error.message)

    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  async function saveCaption(fileId, caption) {
    const { error } = await supabase
      .from('journal_attachments')
      .update({ caption })
      .eq('id', fileId)

    if (error) {
      setMessage(error.message)
      return
    }

    setFiles(current =>
      current.map(file =>
        file.id === fileId
          ? { ...file, caption }
          : file
      )
    )

    setMessage('Caption saved!')
  }

  async function deleteAttachment(file) {
    const confirmed = window.confirm(
      `Delete ${file.file_name}?`
    )

    if (!confirmed) return

    const { error: storageError } = await supabase.storage
      .from('journal-media')
      .remove([file.file_path])

    if (storageError) {
      setMessage(storageError.message)
      return
    }

    const { error: recordError } = await supabase
      .from('journal_attachments')
      .delete()
      .eq('id', file.id)

    if (recordError) {
      setMessage(recordError.message)
      return
    }

    setFiles(current =>
      current.filter(item => item.id !== file.id)
    )

    setMessage('Attachment deleted.')
  }

  return (
    <section className="mission-card">
      <h2>Journal Attachments</h2>

      <p>Save screenshots, photos and PDF documents.</p>

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        multiple
        onChange={handleUpload}
        disabled={uploading}
      />

      {uploading && <p>Uploading files...</p>}

      {message && <p>{message}</p>}

      {files.map(file => (
        <div
          key={file.id}
          style={{ marginTop: '20px' }}
        >
          <p>{file.file_name}</p>

          {file.mime_type.startsWith('image/') && file.signedUrl && (
            <img
              src={file.signedUrl}
              alt={file.file_name}
              style={{
                width: '100%',
                maxWidth: '300px',
                borderRadius: '10px'
              }}
            />
          )}

          {file.mime_type === 'application/pdf' && file.signedUrl && (
            <p>
              <a
                href={file.signedUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open PDF
              </a>
            </p>
          )}

          <textarea
            placeholder="Write a caption for this attachment..."
            defaultValue={file.caption}
            onBlur={event =>
              saveCaption(file.id, event.target.value)
            }
            style={{
              width: '100%',
              marginTop: '10px',
              minHeight: '70px'
            }}
          />

          <button
            type="button"
            onClick={() => deleteAttachment(file)}
            style={{ marginTop: '10px' }}
          >
            Delete Attachment
          </button>
        </div>
      ))}
    </section>
  )
}

export default JournalAttachments
