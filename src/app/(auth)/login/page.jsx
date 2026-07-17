'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await signIn('credentials', { ...form, redirect: false })
    setLoading(false)
    if (res?.ok) {
      router.push('/dashboard')
      router.refresh()
    } else {
      setError('Invalid email or password')
    }
  }

  return (
    <div className="card p-8">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Sign in</h2>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input
            type="email" required autoComplete="email"
            className="input"
            placeholder="me@personal.os"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            type="password" required autoComplete="current-password"
            className="input"
            placeholder="••••••••"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
        No account?{' '}
        <Link href="/register" className="text-brand-600 hover:text-brand-500 font-medium">
          Create one
        </Link>
      </p>

      <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs text-gray-500 dark:text-gray-400">
        Default credentials after seeding:<br />
        <code className="font-mono">me@personal.os</code> / <code className="font-mono">Personal123!</code>
      </div>
    </div>
  )
}
