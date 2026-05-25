import { useTheme } from '@/contexts/ThemeContext'
import { Surface } from '@/components/ui'

export default function DonatePage() {
  const { theme } = useTheme()

  return (
    <div className="flex flex-col gap-5 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: theme.text }}>
          Support Reely
        </h1>
        <p className="text-sm mt-0.5" style={{ color: theme.text2 }}>
          Reely is free, open-source, and self-hosted. If you find it useful, consider supporting its development.
        </p>
      </div>

      <Surface className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--brand-gradient)' }}
          >
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold mb-1" style={{ color: theme.text }}>
              Support the Developer
            </h2>
            <p className="text-xs" style={{ color: theme.text2 }}>
              Every contribution helps keep Reely maintained and growing.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <a
            href="https://ko-fi.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--brand-gradient)' }}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                clipRule="evenodd"
              />
            </svg>
            Donate on Ko-fi
          </a>

          <a
            href="https://github.com/sponsors/larsmikki"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-opacity hover:opacity-80"
            style={{
              background: theme.surface2,
              border: `1px solid ${theme.border}`,
              color: theme.text,
            }}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            GitHub Sponsors
          </a>
        </div>
      </Surface>

      <Surface className="p-6">
        <h2 className="text-base font-bold mb-1" style={{ color: theme.text }}>
          Why support Reely?
        </h2>
        <p className="text-xs mb-5" style={{ color: theme.text2 }}>
          A few reasons your contribution matters.
        </p>
        <ul className="flex flex-col gap-2.5">
          {[
            'Reely is 100% free and self-hosted — no subscriptions, no tracking.',
            'Your data stays on your own server.',
            'Donations fund new features and ongoing maintenance.',
            'Contributions directly support an indie developer.',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: `${theme.accent}18` }}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: theme.accent }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </span>
              <span className="text-sm" style={{ color: theme.text }}>
                {item}
              </span>
            </li>
          ))}
        </ul>
      </Surface>

      <p className="text-sm text-center" style={{ color: theme.text2 }}>
        Thank you for using Reely. Your support means the world.
      </p>
    </div>
  )
}
