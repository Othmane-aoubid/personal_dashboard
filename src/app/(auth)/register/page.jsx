'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setError(''); setLoading(true)
    try {
      await api.auth.register(form.email, form.password, form.name)
      const res = await signIn('credentials', { email: form.email, password: form.password, redirect: false })
      if (res?.ok) { router.push('/dashboard'); router.refresh() }
      else setError('Registration succeeded but login failed — try signing in manually')
    } catch (err) {
      setError(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card p-8">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Create account</h2>
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">{error}</div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        {[['Name', 'name', 'text', 'Othmane'], ['Email', 'email', 'email', 'me@personal.os'],
          ['Password', 'password', 'password', '••••••••'], ['Confirm password', 'confirm', 'password', '••••••••']].map(([label, key, type, placeholder]) => (
          <div key={key}>
            <label className="label">{label}</label>
            <input type={type} required className="input" placeholder={placeholder}
              value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
          </div>
        ))}
        <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-brand-600 hover:text-brand-500 font-medium">Sign in</Link>
      </p>
    </div>
  )
}
