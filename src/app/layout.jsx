import './globals.css'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import SessionProvider from '@/components/providers/SessionProvider'

export const metadata = {
  title: 'Personal OS',
  description: 'Your personal command center',
  icons: { icon: '/favicon.ico' },
}

export default async function RootLayout({ children }) {
  const session = await getServerSession(authOptions)
  const savedTheme = session?.user?.theme || 'system'

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Apply theme before first paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var t=${JSON.stringify(savedTheme)};
            var dark = t==='dark' || (t==='system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
            if(dark) document.documentElement.classList.add('dark');
          })();
        `}} />
      </head>
      <body suppressHydrationWarning>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
