
import { useState, useEffect } from 'react'
import './App.css'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import JournalAttachments from './JournalAttachments'
import BottomNav from './BottomNav'

const defaultTasks = [
  { id: 1, name: 'Cybersecurity Practice', completed: false },
  { id: 2, name: 'Coding & Web Development', completed: false },
  { id: 3, name: 'Trading Session', completed: false },
  { id: 4, name: 'Self-Improvement Session', completed: false },
  { id: 5, name: 'Physical Exercise', completed: false },
]

function getToday() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function App() {
  const [activeTab, setActiveTab] = useState('home')

  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [selectedDate, setSelectedDate] = useState(getToday())

  const [allTasks, setAllTasks] = useState(() => {
    try {
      const saved = localStorage.getItem('phantomTasksByDate')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const [newTask, setNewTask] = useState('')
  const [cloudLoading, setCloudLoading] = useState(false)

  const [journal, setJournal] = useState(() => {
    try {
      const saved = localStorage.getItem('phantomJournal')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  const [journalLoaded, setJournalLoaded] = useState(false)

  const tasks = allTasks[selectedDate] ?? defaultTasks

  const completed = tasks.filter(task => task.completed).length

  const progress = tasks.length
    ? Math.round((completed / tasks.length) * 100)
    : 0

  // Authentication
  useEffect(() => {
    let mounted = true

    async function checkSession() {
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Session error:', error.message)
      }

      if (mounted) {
        setSession(data?.session ?? null)
        setAuthLoading(false)
      }
    }

    checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Local backup for missions
  useEffect(() => {
    localStorage.setItem(
      'phantomTasksByDate',
      JSON.stringify(allTasks)
    )
  }, [allTasks])

  // Local backup for journal
  useEffect(() => {
    localStorage.setItem(
      'phantomJournal',
      JSON.stringify(journal)
    )
  }, [journal])

  // Cloud mission synchronization
  useEffect(() => {
    if (!session) return

    let cancelled = false

    async function syncTasks() {
      setCloudLoading(true)

      try {
        const { data: cloudTasks, error } = await supabase
          .from('daily_tasks')
          .select('*')

        if (error) throw error

        const ownerKey = 'phantomLocalOwner'
        const localOwner = localStorage.getItem(ownerKey)

        const mayMigrateLocal =
          !localOwner || localOwner === session.user.id

        const existing = new Set(
          cloudTasks.map(task =>
            `${task.task_date}|${task.task_name}`
          )
        )

        const rowsToInsert = []

        if (mayMigrateLocal) {
          Object.entries(allTasks).forEach(([date, dateTasks]) => {
            dateTasks.forEach(task => {
              const key = `${date}|${task.name}`

              if (!existing.has(key)) {
                rowsToInsert.push({
                  user_id: session.user.id,
                  task_name: task.name,
                  completed: task.completed,
                  task_date: date
                })

                existing.add(key)
              }
            })
          })

          const todayHasTasks = cloudTasks.some(
            task => task.task_date === getToday()
          )

          if (
            cloudTasks.length === 0 &&
            !allTasks[getToday()] &&
            !todayHasTasks
          ) {
            defaultTasks.forEach(task => {
              rowsToInsert.push({
                user_id: session.user.id,
                task_name: task.name,
                completed: false,
                task_date: getToday()
              })
            })
          }
        }

        if (rowsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('daily_tasks')
            .insert(rowsToInsert)

          if (insertError) throw insertError
        }

        const { data: updatedTasks, error: fetchError } =
          await supabase
            .from('daily_tasks')
            .select('*')

        if (fetchError) throw fetchError

        if (cancelled) return

        const tasksByDate = {}

        updatedTasks.forEach(task => {
          if (!tasksByDate[task.task_date]) {
            tasksByDate[task.task_date] = []
          }

          tasksByDate[task.task_date].push({
            id: task.id,
            name: task.task_name,
            completed: task.completed
          })
        })

        setAllTasks(tasksByDate)

        if (!localOwner || localOwner === session.user.id) {
          localStorage.setItem(ownerKey, session.user.id)
        }
      } catch (error) {
        console.error('Mission sync failed:', error)

        if (!cancelled) {
          alert('Could not sync missions. Please check your connection.')
        }
      } finally {
        if (!cancelled) setCloudLoading(false)
      }
    }

    syncTasks()

    return () => {
      cancelled = true
    }
  }, [session])

  // Cloud journal loading
  useEffect(() => {
    if (!session) return

    let cancelled = false

    async function loadJournals() {
      setJournalLoaded(false)

      try {
        const { data, error } = await supabase
          .from('daily_journals')
          .select('*')

        if (error) throw error

        if (cancelled) return

        const cloudJournal = {}

        data.forEach(entry => {
          cloudJournal[entry.journal_date] = entry.content
        })

        const ownerKey = 'phantomLocalOwner'
        const localOwner = localStorage.getItem(ownerKey)

        const mergedJournal =
          !localOwner || localOwner === session.user.id
            ? { ...journal, ...cloudJournal }
            : cloudJournal

        setJournal(mergedJournal)
        setJournalLoaded(true)
      } catch (error) {
        console.error('Journal loading failed:', error)

        if (!cancelled) {
          alert('Could not load your cloud journal.')
        }
      }
    }

    loadJournals()

    return () => {
      cancelled = true
    }
  }, [session])

  // Cloud journal saving
  useEffect(() => {
    if (!session || !journalLoaded) return

    const timeout = setTimeout(async () => {
      try {
        const rows = Object.entries(journal).map(
          ([date, content]) => ({
            user_id: session.user.id,
            journal_date: date,
            content,
            updated_at: new Date().toISOString()
          })
        )

        if (rows.length === 0) return

        const { error } = await supabase
          .from('daily_journals')
          .upsert(rows, {
            onConflict: 'user_id,journal_date'
          })

        if (error) throw error
      } catch (error) {
        console.error('Journal cloud save failed:', error)
      }
    }, 1000)

    return () => clearTimeout(timeout)
  }, [journal, journalLoaded, session])

  // Update missions
  function updateTasks(updatedTasks) {
    setAllTasks(previous => ({
      ...previous,
      [selectedDate]: updatedTasks
    }))
  }

  // Update journal
  function updateJournal(text) {
    setJournal(previous => ({
      ...previous,
      [selectedDate]: text
    }))
  }

  // Complete missions
  async function toggleTask(id) {
    const task = tasks.find(item => item.id === id)
    if (!task) return

    try {
      let cloudTaskId = id

      if (typeof id === 'number') {
        const { data, error } = await supabase
          .from('daily_tasks')
          .insert({
            user_id: session.user.id,
            task_name: task.name,
            completed: !task.completed,
            task_date: selectedDate
          })
          .select()
          .single()

        if (error) throw error

        cloudTaskId = data.id
      } else {
        const { error } = await supabase
          .from('daily_tasks')
          .update({ completed: !task.completed })
          .eq('id', id)
          .eq('user_id', session.user.id)

        if (error) throw error
      }

      updateTasks(
        tasks.map(item =>
          item.id === id
            ? {
                ...item,
                id: cloudTaskId,
                completed: !item.completed
              }
            : item
        )
      )
    } catch (error) {
      console.error('Mission update failed:', error)
      alert('Could not update your mission. Please try again.')
    }
  }

  // Add missions
  async function addTask() {
    const taskName = newTask.trim()
    if (!taskName) return

    try {
      const { data, error } = await supabase
        .from('daily_tasks')
        .insert({
          user_id: session.user.id,
          task_name: taskName,
          completed: false,
          task_date: selectedDate
        })
        .select()
        .single()

      if (error) throw error

      updateTasks([
        ...tasks,
        {
          id: data.id,
          name: data.task_name,
          completed: data.completed
        }
      ])

      setNewTask('')
    } catch (error) {
      console.error('Add mission failed:', error)
      alert('Could not save your new mission. Please try again.')
    }
  }

  // Delete missions
  async function deleteTask(id) {
    if (typeof id === 'number') {
      updateTasks(tasks.filter(task => task.id !== id))
      return
    }

    try {
      const { error } = await supabase
        .from('daily_tasks')
        .delete()
        .eq('id', id)
        .eq('user_id', session.user.id)

      if (error) throw error

      updateTasks(tasks.filter(task => task.id !== id))
    } catch (error) {
      console.error('Delete mission failed:', error)
      alert('Could not delete your mission. Please try again.')
    }
  }

  // Sign out
  async function handleSignOut() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      alert(error.message)
    }
  }

  if (authLoading) {
    return <p>Loading Project Phantom...</p>
  }

  if (!session) {
    return <Auth />
  }

  return (
    <div className="dashboard">

      <header>
        <h1>PROJECT PHANTOM</h1>
        <p>DISCIPLINE. FOCUS. PROGRESS.</p>
      </header>

      <main style={{ paddingBottom: '100px' }}>

        
{activeTab === 'home' && (
  <div className="home-dashboard">
    <section className="home-hero">
      <p className="home-eyebrow">PROJECT PHANTOM / DASHBOARD</p>
      <h2>Welcome back, Phantom.</h2>
      <p>Discipline. Focus. Progress.</p>
      <span className="home-quote">
        "Your future is built by what you do today."
      </span>
      {cloudLoading && <p className="sync-status">Syncing your missions...</p>}
    </section>

    <section className="home-stats">
      <div className="home-stat-card">
        <span>DAILY PROGRESS</span>
        <strong>{progress}%</strong>
        <small>Completed</small>
      </div>
      <div className="home-stat-card">
        <span>MISSIONS</span>
        <strong>{completed}/{tasks.length}</strong>
        <small>Completed today</small>
      </div>
    </section>

    <section className="home-panel">
      <div className="home-section-heading">
        <h3>DAILY PERFORMANCE</h3>
        <span>{progress}%</span>
      </div>
      <div className="home-progress-track">
        <div
          className="home-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p>Every completed mission moves you forward.</p>
    </section>

    <section className="home-panel">
      <h3>QUICK ACCESS</h3>
      <div className="home-quick-grid">
        <button onClick={() => setActiveTab('calendar')}>
          <span>📅</span>
          Calendar
        </button>
        <button onClick={() => setActiveTab('journal')}>
          <span>📖</span>
          Journal
        </button>
        <button onClick={() => setActiveTab('progress')}>
          <span>📊</span>
          Progress
        </button>
        <button onClick={() => setActiveTab('more')}>
          <span>⚙️</span>
          More
        </button>
      </div>
    </section>

    <section className="home-panel">
      <h3>YOUR FOCUS AREAS</h3>
      <div className="focus-row">
        <span>🛡️</span>
        <div><strong>Cybersecurity</strong><small>Learn. Practice. Secure.</small></div>
      </div>
      <div className="focus-row">
        <span>💻</span>
        <div><strong>Coding & Web Development</strong><small>Build your skills.</small></div>
      </div>
      <div className="focus-row">
        <span>📈</span>
        <div><strong>Trading</strong><small>Patience. Strategy. Discipline.</small></div>
      </div>
      <div className="focus-row">
        <span>🧠</span>
        <div><strong>Self-Improvement</strong><small>Become better every day.</small></div>
      </div>
    </section>
  </div>
)}


        
{activeTab === 'calendar' && (
  <div className="calendar-dashboard">
    <section className="calendar-hero">
      <span>PHANTOM / OPERATIONS</span>
      <h2>Calendar & Missions</h2>
      <p>Plan your day. Complete your missions.</p>
    </section>

    {cloudLoading && (
      <p className="sync-status">Syncing your missions...</p>
    )}

    <section className="calendar-panel">
      <div className="calendar-heading">
        <div>
          <span>YOUR SCHEDULE</span>
          <h3>Daily Missions</h3>
        </div>
        <span className="mission-count">
          {completed}/{tasks.length}
        </span>
      </div>

      <label htmlFor="mission-date">SELECT DATE</label>
      <input
        id="mission-date"
        className="phantom-date-input"
        type="date"
        value={selectedDate}
        onChange={e => setSelectedDate(e.target.value)}
      />

      <div className="mission-input-row">
        <input
          type="text"
          placeholder="Enter a new mission..."
          value={newTask}
          onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') addTask()
          }}
        />
        <button type="button" onClick={addTask}>+ Add</button>
      </div>

      <div className="mission-list">
        {tasks.length === 0 && (
          <p className="empty-missions">
            No missions scheduled. Add your first mission above.
          </p>
        )}

        {tasks.map((task, index) => (
          <div
            key={task.id}
            className={`mission-item ${task.completed ? 'mission-completed' : ''}`}
          >
            <span className="mission-number">
              {String(index + 1).padStart(2, '0')}
            </span>

            <input
              type="checkbox"
              checked={task.completed}
              onChange={() => toggleTask(task.id)}
            />

            <span className="mission-name">{task.name}</span>

            <button
              type="button"
              className="mission-delete"
              onClick={() => deleteTask(task.id)}
              aria-label={`Delete ${task.name}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="mission-footer">
        <span>DAILY COMPLETION</span>
        <strong>{progress}%</strong>
      </div>

      <div className="home-progress-track">
        <div
          className="home-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
    </section>
  </div>
)}


       
{activeTab === 'journal' && (
  <div className="journal-dashboard">
    <section className="journal-hero">
      <span>PHANTOM / PERSONAL RECORDS</span>
      <h2>Daily Journal</h2>
      <p>Reflect. Document. Evolve.</p>
    </section>

    <section className="journal-panel">
      <div className="journal-heading">
        <div>
          <span>YOUR PRIVATE SPACE</span>
          <h3>Daily Accomplishments</h3>
        </div>
        <span className="journal-icon">📖</span>
      </div>

      <label htmlFor="journal-date">SELECT JOURNAL DATE</label>
      <input
        id="journal-date"
        className="phantom-date-input"
        type="date"
        value={selectedDate}
        onChange={e => setSelectedDate(e.target.value)}
      />

      <div className="journal-writing-heading">
        <h3>Today's Reflection</h3>
        <span>WRITE FREELY</span>
      </div>

      <textarea
        className="journal-textarea"
        value={journal[selectedDate] || ''}
        onChange={e => updateJournal(e.target.value)}
        placeholder={"What did you accomplish today?\n\nWhat did you learn?\n\nWhat could you improve tomorrow?\n\nWrite your thoughts here..."}
        rows={10}
      />

      <p className="journal-save-status">
        <span>●</span> Your journal saves automatically.
      </p>
    </section>

    <section className="journal-panel">
      <div className="journal-heading">
        <div>
          <span>MEMORIES & DOCUMENTS</span>
          <h3>Journal Attachments</h3>
        </div>
        <span className="journal-icon">📎</span>
      </div>

      <JournalAttachments selectedDate={selectedDate} />
    </section>
  </div>
)}

        
{activeTab === 'progress' && (
  <div className="progress-dashboard">
    <section className="progress-hero">
      <span>PHANTOM / PERFORMANCE</span>
      <h2>Progress Centre</h2>
      <p>Measure your discipline. Track your growth.</p>
    </section>

    <section className="progress-main-card">
      <span className="progress-label">DAILY COMPLETION RATE</span>
      <div className="progress-circle" style={{ '--progress': progress }}>
        <div className="progress-circle-inner">
          <strong>{progress}%</strong>
          <small>COMPLETE</small>
        </div>
      </div>
      <h3>
        {progress === 100
          ? 'Mission accomplished.'
          : progress >= 50
          ? 'You are making progress.'
          : 'Your journey starts here.'}
      </h3>
      <p>{completed} of {tasks.length} missions completed.</p>
    </section>

    <section className="progress-stat-grid">
      <div className="progress-stat">
        <span>🎯</span>
        <strong>{tasks.length}</strong>
        <small>Total missions</small>
      </div>
      <div className="progress-stat">
        <span>✅</span>
        <strong>{completed}</strong>
        <small>Completed</small>
      </div>
      <div className="progress-stat">
        <span>⌛</span>
        <strong>{tasks.length - completed}</strong>
        <small>Remaining</small>
      </div>
    </section>

    <section className="progress-breakdown">
      <h3>MISSION BREAKDOWN</h3>
      <p>Selected date: {selectedDate}</p>

      {tasks.length === 0 ? (
        <p>No missions recorded for this date.</p>
      ) : (
        tasks.map((task, index) => (
          <div className="breakdown-row" key={task.id}>
            <span className="breakdown-number">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="breakdown-name">{task.name}</span>
            <span className={task.completed ? 'breakdown-done' : 'breakdown-pending'}>
              {task.completed ? 'DONE' : 'PENDING'}
            </span>
          </div>
        ))
      )}
    </section>
  </div>
)}


        
{activeTab === 'more' && (
  <div className="more-dashboard">
    <section className="more-hero">
      <span>PHANTOM / CONTROL CENTRE</span>
      <h2>More</h2>
      <p>Manage your account and application.</p>
    </section>

    <section className="more-panel">
      <div className="more-panel-heading">
        <span>👤</span>
        <div>
          <h3>ACCOUNT</h3>
          <small>Your personal profile</small>
        </div>
      </div>

      <div className="account-info">
        <span>REGISTERED EMAIL</span>
        <p>{session.user.email}</p>
      </div>

      <button
        type="button"
        className="phantom-signout"
        onClick={handleSignOut}
      >
        <span>↪</span> Sign Out
      </button>
    </section>

    <section className="more-panel">
      <div className="more-panel-heading">
        <span>🥷</span>
        <div>
          <h3>PROJECT PHANTOM</h3>
          <small>Your personal productivity system</small>
        </div>
      </div>

      <div className="phantom-brand">
        <h2>PHANTOM</h2>
        <p>DISCIPLINE. FOCUS. PROGRESS.</p>
        <div className="phantom-brand-line" />
        <small>Your future is built by what you do today.</small>
      </div>
    </section>

    <section className="more-version">
      <span>PROJECT PHANTOM</span>
      <span>PERSONAL EDITION</span>
    </section>
  </div>
)}


      </main>

      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

    </div>
  )
}

export default App
