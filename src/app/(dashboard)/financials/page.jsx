'use client'
import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

function Modal({ open, onClose, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

const CHART_COLORS = ['#5c7cfa','#20c997','#f59e0b','#f87171','#a78bfa','#34d399','#fb923c','#60a5fa']

export default function FinancialsPage() {
  const { data: session } = useSession()
  const [transactions, setTransactions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [summary, setSummary] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [tab, setTab] = useState('overview') // overview | transactions | accounts
  const [form, setForm] = useState({ type: 'expense', amount: '', description: '', date: new Date().toISOString().slice(0,10), account_id: '', category_id: '', tags: [] })

  useEffect(() => { if (session) load() }, [session])

  async function load() {
    try {
      const [txns, accs, cats, sum] = await Promise.all([
        api.financials.transactions({}, session),
        api.financials.accounts(session),
        api.financials.categories(session),
        api.financials.summary(session),
      ])
      setTransactions(txns); setAccounts(accs); setCategories(cats); setSummary(sum)
    } catch (_) {}
  }

  async function handleAddTxn() {
    if (!form.amount || isNaN(form.amount)) { toast.error('Valid amount required'); return }
    try {
      await api.financials.createTxn({ ...form, amount: parseFloat(form.amount) }, session)
      toast.success('Transaction added')
      setShowModal(false); load()
    } catch (e) { toast.error(e.message) }
  }

  async function handleDeleteTxn(id) {
    try { await api.financials.deleteTxn(id, session); toast.success('Deleted'); load() }
    catch (e) { toast.error(e.message) }
  }

  // Chart data
  const expenseCats = categories.filter(c => c.type === 'expense')
  const pieData = expenseCats.map(cat => {
    const total = transactions.filter(t => t.category_id === cat.id && t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    return { name: cat.name, value: total }
  }).filter(d => d.value > 0)

  // Monthly bar data (last 6 months)
  const monthlyData = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    const y = d.getFullYear(); const m = d.getMonth()
    const label = d.toLocaleDateString('en', { month: 'short' })
    const inc = transactions.filter(t => { const td = new Date(t.date); return td.getFullYear()===y && td.getMonth()===m && t.type==='income' }).reduce((s,t)=>s+t.amount,0)
    const exp = transactions.filter(t => { const td = new Date(t.date); return td.getFullYear()===y && td.getMonth()===m && t.type==='expense' }).reduce((s,t)=>s+t.amount,0)
    monthlyData.push({ month: label, Income: inc, Expenses: exp })
  }

  const expCats = categories.filter(c => c.type === 'expense')
  const incCats = categories.filter(c => c.type === 'income')

  return (
    <div className="space-y-4 fade-in">
      {/* Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1">
          {['overview','transactions','accounts'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`btn-ghost text-sm capitalize ${tab===t ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600' : ''}`}>{t}</button>
          ))}
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">+ Transaction</button>
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Income', value: summary?.month_income || 0, color: 'text-green-600' },
              { label: 'Expenses', value: summary?.month_expense || 0, color: 'text-red-500' },
              { label: 'Net', value: summary?.month_net || 0, color: summary?.month_net >= 0 ? 'text-green-600' : 'text-red-500' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card p-5 text-center">
                <p className="text-gray-400 text-sm">{label} (this month)</p>
                <p className={`text-2xl font-bold mt-1 ${color}`}>{formatCurrency(value)}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Monthly trend</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData} barSize={20}>
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={v => formatCurrency(v)} />
                  <Legend />
                  <Bar dataKey="Income" fill="#20c997" radius={[4,4,0,0]} />
                  <Bar dataKey="Expenses" fill="#f87171" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Spending by category</h3>
              {pieData.length === 0 ? <p className="text-gray-400 text-sm text-center py-8">No expense data yet.</p> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                      {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Transactions */}
      {tab === 'transactions' && (
        <div className="card divide-y divide-gray-100 dark:divide-gray-800">
          {transactions.length === 0 && <div className="p-8 text-center text-gray-400">No transactions yet.</div>}
          {transactions.map(t => {
            const cat = categories.find(c => c.id === t.category_id)
            return (
              <div key={t.id} className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg">{cat?.icon || (t.type==='income' ? '💰' : '💸')}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.description || cat?.name || t.type}</p>
                  <p className="text-xs text-gray-400">{formatDate(t.date)} {cat && `· ${cat.name}`}</p>
                </div>
                <p className={`font-semibold text-sm ${t.type==='income' ? 'text-green-600' : 'text-red-500'}`}>
                  {t.type==='income' ? '+' : '-'}{formatCurrency(t.amount)}
                </p>
                <button onClick={() => handleDeleteTxn(t.id)} className="text-gray-300 hover:text-red-400 transition-colors text-lg">×</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Accounts */}
      {tab === 'accounts' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(a => (
            <div key={a.id} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="font-medium text-gray-900 dark:text-white">{a.name}</p>
                <span className="badge bg-gray-100 dark:bg-gray-800 text-gray-500 capitalize">{a.type}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(a.balance, a.currency)}</p>
              <p className="text-xs text-gray-400 mt-1">{a.currency}</p>
            </div>
          ))}
          {accounts.length === 0 && <div className="col-span-3 text-center text-gray-400 py-8">No accounts. Seed data to get started.</div>}
        </div>
      )}

      {/* Add transaction modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-900 dark:text-white">Add transaction</h3>
          <button onClick={() => setShowModal(false)} className="text-gray-400 text-xl">×</button>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            {['expense','income'].map(t => (
              <button key={t} onClick={() => setForm(f=>({...f,type:t}))}
                className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${form.type===t ? (t==='income' ? 'bg-green-600 text-white' : 'bg-red-500 text-white') : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                {t}
              </button>
            ))}
          </div>
          <div><label className="label">Amount (MAD) *</label><input type="number" min="0" step="0.01" className="input" placeholder="0.00" value={form.amount} onChange={e => setForm(f=>({...f,amount:e.target.value}))} /></div>
          <div><label className="label">Description</label><input className="input" placeholder="What's this for?" value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} /></div>
          <div><label className="label">Date</label><input type="date" className="input" value={form.date} onChange={e => setForm(f=>({...f,date:e.target.value}))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Account</label>
              <select className="input" value={form.account_id} onChange={e => setForm(f=>({...f,account_id:e.target.value}))}>
                <option value="">— None —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category_id} onChange={e => setForm(f=>({...f,category_id:e.target.value}))}>
                <option value="">— None —</option>
                {(form.type==='income' ? incCats : expCats).map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={() => setShowModal(false)} className="btn-secondary ml-auto">Cancel</button>
          <button onClick={handleAddTxn} className="btn-primary">Add</button>
        </div>
      </Modal>
    </div>
  )
}
