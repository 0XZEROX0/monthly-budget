import { registerPlugin } from '@capacitor/core'

/** The native side is android/app/src/main/java/com/monthlybudget/app/GoogleSignInPlugin.java. */
interface GoogleSignInPlugin {
  /** Shows Google's account picker and returns an ID token for the given web client. */
  signIn(opts: { serverClientId: string }): Promise<{ idToken: string }>
}

export const GoogleSignIn = registerPlugin<GoogleSignInPlugin>('GoogleSignIn')
