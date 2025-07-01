import React, { useEffect, useState } from 'react'
import { handleGoogleAuthCallback, syncGoogleCalendarEvents } from '../supabase.js'

const GoogleAuthCallback = ({ family, onSuccess, onError }) => {
  const [status, setStatus] = useState('processing')
  const [message, setMessage] = useState('Connecting to Google Calendar...')

  useEffect(() => {
    const processGoogleAuth = async () => {
      try {
        // Get authorization code from URL
        const urlParams = new URLSearchParams(window.location.search)
        const code = urlParams.get('code')
        const error = urlParams.get('error')

        if (error) {
          throw new Error(`Google Auth Error: ${error}`)
        }

        if (!code) {
          throw new Error('No authorization code received from Google')
        }

        setMessage('Exchanging authorization code for access token...')
        
        // Exchange code for tokens
        await handleGoogleAuthCallback(code, family.family_id)
        
        setMessage('Syncing your Google Calendar events...')
        
        // Sync calendar events
        const syncResult = await syncGoogleCalendarEvents(family.family_id)
        
        setStatus('success')
        setMessage(syncResult.message)
        
        // Clean up URL and redirect
        setTimeout(() => {
          window.history.replaceState({}, document.title, window.location.pathname)
          onSuccess()
        }, 2000)

      } catch (error) {
        console.error('Google Calendar auth error:', error)
        setStatus('error')
        setMessage(error.message)
        onError(error)
      }
    }

    processGoogleAuth()
  }, [family, onSuccess, onError])

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6 text-center">
        <div className="mb-4">
          {status === 'processing' && (
            <div className="animate-spin text-4xl mb-4">⟳</div>
          )}
          {status === 'success' && (
            <div className="text-4xl mb-4">✅</div>
          )}
          {status === 'error' && (
            <div className="text-4xl mb-4">❌</div>
          )}
        </div>
        
        <h3 className="text-lg font-semibold mb-2">
          {status === 'processing' && 'Setting up Google Calendar'}
          {status === 'success' && 'Google Calendar Connected!'}
          {status === 'error' && 'Connection Failed'}
        </h3>
        
        <p className="text-gray-600 mb-4">{message}</p>
        
        {status === 'error' && (
          <button
            onClick={() => {
              window.history.replaceState({}, document.title, window.location.pathname)
              onError(new Error(message))
            }}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            Close
          </button>
        )}
        
        {status === 'processing' && (
          <div className="text-sm text-gray-500">
            Please wait while we set up your calendar sync...
          </div>
        )}
      </div>
    </div>
  )
}

export default GoogleAuthCallback
