export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-brand-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-600 rounded-xl mb-4">
            <span className="text-white text-xl">⚡</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Personal OS</h1>
          <p className="text-gray-400 text-sm mt-1">Your personal command center</p>
        </div>
        {children}
      </div>
    </div>
  )
}
