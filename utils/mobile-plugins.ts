"use client"

import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { ScreenOrientation } from '@capacitor/screen-orientation'
import { Device } from '@capacitor/device'
import { KeepAwake } from '@capacitor-community/keep-awake'

// Check if we're running as a native app
export const isNative = () => Capacitor.isNativePlatform()

// Initialize all mobile plugins
export const initMobilePlugins = async () => {
  if (!isNative()) return

  try {
    // Handle status bar
    if (Capacitor.getPlatform() === 'android') {
      // For Android, set status bar color and make it overlay the app
      // This prevents the app from being pushed down by the status bar
      await StatusBar.setBackgroundColor({ color: '#1f1f1f' })
      await StatusBar.setOverlaysWebView({ overlay: true });
    } else if (Capacitor.getPlatform() === 'ios') {
      // For iOS, use dark text on light backgrounds or light text on dark
      await StatusBar.setStyle({ style: Style.Dark });
    }
    
    // Lock screen orientation to portrait
    await ScreenOrientation.lock({ orientation: 'portrait' })
    
    // Keep the screen awake while the app is active
    await KeepAwake.keepAwake()
    
    // iOS needs explicit permission handling for microphone
    if (Capacitor.getPlatform() === 'ios') {
      // Ask for permissions early to improve user experience
      await requestMicrophonePermission()
    }
    
    // After initialization is complete, hide the splash screen
    await SplashScreen.hide()
  } catch (err) {
    console.error('Error initializing mobile plugins:', err)
  }
}

// Check if the device has permission to use the microphone
export const checkMicrophonePermission = async (): Promise<boolean> => {
  if (!isNative()) return true // In web, permissions are handled by the browser
  
  try {
    // Try to get access to the microphone
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // Clean up
    stream.getTracks().forEach(track => track.stop())
    return true
  } catch (err) {
    console.error('Error checking microphone permission:', err)
    return false
  }
}

// Request microphone permission explicitly
export const requestMicrophonePermission = async (): Promise<boolean> => {
  if (!isNative()) return true // In web, permissions are handled by the browser
  
  console.log('Attempting to request microphone permission on platform:', Capacitor.getPlatform())
  
  try {
    // This will trigger the permission dialog on iOS/Android if not already granted
    console.log('Before getUserMedia call')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    console.log('After getUserMedia call - permission granted')
    // Clean up
    stream.getTracks().forEach(track => track.stop())
    return true
  } catch (err) {
    console.error('Error requesting microphone permission:', err)
    return false
  }
}

// Toggle keep awake mode
export const toggleKeepAwake = async (keepAwake: boolean) => {
  if (!isNative()) return
  
  try {
    if (keepAwake) {
      await KeepAwake.keepAwake()
    } else {
      await KeepAwake.allowSleep()
    }
  } catch (err) {
    console.error('Error toggling keep awake:', err)
  }
} 