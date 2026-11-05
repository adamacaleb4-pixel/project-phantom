import { useState } from 'react'
import { supabase } from './supabaseClient'

function Auth() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleAuth(e) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const { error } = isLogin
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })

      if (error) throw error

      setMessage(
        isLogin
          ? 'Login successful!'
          : 'Account created! Check your email to confirm your account.'
      )
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="dashboard">
      <header>
        <h1>PROJECT PHANTOM</h1>
        <p>DISCIPLINE. FOCUS. PROGRESS.</p>
      </header>

      <main>
        <section className="mission-card">
          <h2>{isLogin ? 'Welcome Back' : 'Create Your Account'}</h2>
          <p>{isLogin ? 'Sign in to your private dashboard.' : 'Start your personal journey.'}</p>

          <form onSubmit={handleAuth}>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />

            <input
              type="password"
              placeholder="Password (at least 6 characters)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength={6}
              required
            />

            <button type="submit" disabled={loading}>
              {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <p>{message}</p>

          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin)
              setMessage('')
            }}
          >
            {isLogin ? 'Create an account' : 'Already have an account? Sign in'}
          </button>
        </section>
      </main>
    </div>
  )
}

export default Auth