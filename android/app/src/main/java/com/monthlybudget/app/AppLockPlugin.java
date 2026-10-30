package com.monthlybudget.app;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * App lock: Android's own prompt for the fingerprint (or face), with the phone's PIN,
 * pattern or password as the other way in. Nothing is stored by the app; Android checks it.
 */
@CapacitorPlugin(name = "AppLock")
public class AppLockPlugin extends Plugin {
    private static final int AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    @PluginMethod
    public void available(PluginCall call) {
        int can = BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS);
        JSObject ret = new JSObject();
        ret.put("available", can == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(ret);
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(call.getString("title", "Unlock"))
            .setSubtitle(call.getString("subtitle", ""))
            .setAllowedAuthenticators(AUTHENTICATORS)
            .build();
        getActivity().runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(getActivity(), ContextCompat.getMainExecutor(getContext()),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        JSObject ret = new JSObject();
                        ret.put("ok", true);
                        call.resolve(ret);
                    }

                    @Override
                    public void onAuthenticationError(int code, CharSequence message) {
                        call.reject(message.toString(), String.valueOf(code));
                    }
                    // A wrong finger only shakes the prompt; it stays open for another try.
                });
            prompt.authenticate(info);
        });
    }
}
