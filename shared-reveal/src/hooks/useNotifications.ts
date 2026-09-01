import { useEffect, useRef, useState } from 'react'
import { getToken, onMessage } from 'firebase/messaging'
import { doc, updateDoc } from 'firebase/firestore'
import { db, getMessagingInstance } from '../firebase/config'

export interface NotificationState {
  supported: boolean
  permission: NotificationPermission | 'unknown'
  token: string | null
  foregroundMessage: { title: string; body: string } | null
  requestPermission: () => Promise<void>
  clearForegroundMessage: () => void
}

export function useNotifications(uid: string | null): NotificationState {
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unknown'>('unknown')
  const [token, setToken] = useState<string | null>(null)
  const [foregroundMessage, setForegroundMessage] = useState<{ title: string; body: string } | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  // Check support and current permission on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setSupported(false)
      setPermission('unknown')
      return
    }
    setPermission(Notification.permission)

    getMessagingInstance().then((m) => {
      setSupported(m !== null)
    })
  }, [])

  // Wire foreground message handler when we have a token
  useEffect(() => {
    if (!uid || !token) return
    let active = true

    getMessagingInstance().then((m) => {
      if (!m || !active) return
      const unsub = onMessage(m, (payload) => {
        const title = payload.notification?.title ?? 'Bird Eye'
        const body = payload.notification?.body ?? ''
        setForegroundMessage({ title, body })
      })
      unsubRef.current = unsub
    })

    return () => {
      active = false
      unsubRef.current?.()
      unsubRef.current = null
    }
  }, [uid, token])

  const requestPermission = async () => {
    if (!uid) return
    const m = await getMessagingInstance()
    if (!m) return

    const result = await Notification.requestPermission()
    setPermission(result)
    if (result !== 'granted') return

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
    if (!vapidKey || vapidKey === 'GENERATE_FROM_FIREBASE_CONSOLE') {
      console.warn('[useNotifications] VITE_FIREBASE_VAPID_KEY not configured')
      return
    }

    try {
      const fcmToken = await getToken(m, { vapidKey })
      setToken(fcmToken)
      await updateDoc(doc(db, `users/${uid}`), { fcmToken })
    } catch (err) {
      console.warn('[useNotifications] getToken failed:', err)
    }
  }

  // Auto-get token if permission already granted (e.g. returning user)
  useEffect(() => {
    if (!uid || permission !== 'granted') return

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
    if (!vapidKey || vapidKey === 'GENERATE_FROM_FIREBASE_CONSOLE') return

    let active = true
    getMessagingInstance().then(async (m) => {
      if (!m || !active) return
      try {
        const fcmToken = await getToken(m, { vapidKey })
        if (!active) return
        setToken(fcmToken)
        await updateDoc(doc(db, `users/${uid}`), { fcmToken })
      } catch (err) {
        console.warn('[useNotifications] auto getToken failed:', err)
      }
    })

    return () => { active = false }
  }, [uid, permission])

  return {
    supported,
    permission,
    token,
    foregroundMessage,
    requestPermission,
    clearForegroundMessage: () => setForegroundMessage(null),
  }
}
