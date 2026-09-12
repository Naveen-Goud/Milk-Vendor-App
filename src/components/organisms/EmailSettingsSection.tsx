import { useEffect, useState, type FormEvent } from 'react'
import { Mail, Eye, EyeOff, CheckCircle2, ExternalLink } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { FormField } from '../molecules/FormField'
import { TextInput } from '../atoms/Inputs'
import { PrimaryButton, SecondaryButton, DangerLink } from '../atoms/Button'
import { IconCircle } from '../atoms/IconCircle'

// Each vendor connects their OWN free Resend account rather than sharing
// one key across every vendor on this app — see the comment block at the
// top of supabase/functions/manage-email-settings/index.ts for why. This
// component is the UI half of that: a small setup form, a test-before-you-
// save step, and a "connected" status card once a key is saved.
export function EmailSettingsSection() {
  const { vendor, emailSettings, emailSettingsLoading, refreshEmailSettings, testEmailSettings, saveEmailSettings, removeEmailSettings } = useApp()

  const [editing, setEditing] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [fromEmail, setFromEmail] = useState('')
  const [fromName, setFromName] = useState(vendor?.name ?? '')
  const [testRecipient, setTestRecipient] = useState('')

  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testError, setTestError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  useEffect(() => {
    refreshEmailSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendor?.id])

  async function handleTest(e: FormEvent) {
    e.preventDefault()
    if (!apiKey.trim() || !fromEmail.trim() || !testRecipient.trim()) return
    setTestState('testing')
    setTestError('')
    try {
      await testEmailSettings({ apiKey: apiKey.trim(), fromEmail: fromEmail.trim(), fromName: fromName.trim() || undefined, testRecipient: testRecipient.trim() })
      setTestState('success')
    } catch (err) {
      setTestState('error')
      setTestError(err instanceof Error ? err.message : 'Test send failed')
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      await saveEmailSettings({ apiKey: apiKey.trim(), fromEmail: fromEmail.trim(), fromName: fromName.trim() || undefined })
      setEditing(false)
      setApiKey('')
      setTestState('idle')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    if (!confirmingRemove) { setConfirmingRemove(true); return }
    await removeEmailSettings()
    setConfirmingRemove(false)
  }

  function startEditing() {
    setFromEmail(emailSettings?.fromEmail ?? '')
    setFromName(emailSettings?.fromName ?? vendor?.name ?? '')
    setApiKey('')
    setTestState('idle')
    setSaveError('')
    setEditing(true)
  }

  return (
    <section className="mt-4 rounded-2xl border border-crate-100 bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <IconCircle><Mail size={17} /></IconCircle>
        <div>
          <h2 className="font-display text-sm font-bold text-ink-900">Email sending</h2>
          <p className="text-xs text-ink-600">Bills are emailed through your own free Resend account — never shared with other vendors on this app.</p>
        </div>
      </div>

      {emailSettingsLoading && !editing && (
        <p className="text-sm text-ink-600">Checking your connection…</p>
      )}

      {!emailSettingsLoading && emailSettings && !editing && (
        <div className="rounded-xl bg-fresh-50 p-3">
          <div className="mb-2 flex items-center gap-2 text-fresh-600">
            <CheckCircle2 size={16} />
            <span className="text-sm font-semibold">Connected</span>
          </div>
          <p className="text-sm text-ink-900">Sending as <span className="font-semibold">{emailSettings.fromName ?? vendor?.name}</span> &lt;{emailSettings.fromEmail}&gt;</p>
          <p className="mt-1 font-mono text-xs text-ink-600">Key •••• {emailSettings.keyLast4}</p>
          <div className="mt-3 flex gap-2">
            <SecondaryButton type="button" onClick={startEditing} className="flex-1">Change key</SecondaryButton>
            <DangerLink type="button" onClick={handleRemove} className="shrink-0 px-2">
              {confirmingRemove ? 'Tap again to confirm' : 'Disconnect'}
            </DangerLink>
          </div>
        </div>
      )}

      {!emailSettingsLoading && !emailSettings && !editing && (
        <div>
          <p className="mb-3 text-sm text-ink-600">Not connected yet — bills can't be emailed until you add your Resend API key.</p>
          <PrimaryButton type="button" onClick={startEditing}>Set up email sending</PrimaryButton>
        </div>
      )}

      {editing && (
        <form onSubmit={handleTest}>
          <p className="mb-3 text-xs text-ink-600">
            Free at{' '}
            <a href="https://resend.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-crate-500 underline">
              resend.com<ExternalLink size={11} />
            </a>{' '}
            — sign up, verify a sending domain, then paste your API key below. Send a test email first; saving is enabled once it succeeds.
          </p>

          <FormField label="Resend API key">
            <div className="relative">
              <TextInput
                required
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setTestState('idle') }}
                placeholder="re_xxxxxxxxxxxxxxxx"
                className="pr-10"
              />
              <button type="button" onClick={() => setShowKey((s) => !s)} aria-label={showKey ? 'Hide key' : 'Show key'} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-600">
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </FormField>

          <FormField label="From email">
            <TextInput required type="email" value={fromEmail} onChange={(e) => { setFromEmail(e.target.value); setTestState('idle') }} placeholder="billing@yourdairy.com" />
          </FormField>

          <FormField label="From name (optional)">
            <TextInput value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder={vendor?.name ?? 'Your Dairy'} />
          </FormField>

          <FormField label="Send a test email to">
            <TextInput required type="email" value={testRecipient} onChange={(e) => { setTestRecipient(e.target.value); setTestState('idle') }} placeholder="you@example.com" />
          </FormField>

          {testState === 'error' && <p className="mb-3 text-xs font-medium text-red-500">{testError}</p>}
          {testState === 'success' && (
            <p className="mb-3 flex items-center gap-1 text-xs font-medium text-fresh-600"><CheckCircle2 size={13} /> Test email sent — check your inbox, then save below.</p>
          )}
          {saveError && <p className="mb-3 text-xs font-medium text-red-500">{saveError}</p>}

          <div className="flex gap-2">
            <SecondaryButton type="submit" disabled={testState === 'testing'} className="flex-1">
              {testState === 'testing' ? 'Sending test…' : 'Send test email'}
            </SecondaryButton>
            <PrimaryButton type="button" onClick={handleSave} disabled={testState !== 'success' || saving} className="flex-1">
              {saving ? 'Saving…' : 'Save & connect'}
            </PrimaryButton>
          </div>
          <button type="button" onClick={() => setEditing(false)} className="mt-3 w-full text-center text-xs font-semibold text-ink-600">
            Cancel
          </button>
        </form>
      )}
    </section>
  )
}
