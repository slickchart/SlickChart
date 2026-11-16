package com.slickchart.app;

import android.Manifest;
import android.app.Application;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.squareup.sdk.mobilepayments.MobilePaymentsSdk;
import com.squareup.sdk.mobilepayments.authorization.AuthorizationManager;
import com.squareup.sdk.mobilepayments.authorization.AuthorizedLocation;
import com.squareup.sdk.mobilepayments.core.Result;
import com.squareup.sdk.mobilepayments.payment.CurrencyCode;
import com.squareup.sdk.mobilepayments.payment.Money;
import com.squareup.sdk.mobilepayments.payment.Payment;
import com.squareup.sdk.mobilepayments.payment.PaymentErrorCode;
import com.squareup.sdk.mobilepayments.payment.PaymentParameters;
import com.squareup.sdk.mobilepayments.payment.ProcessingMode;
import com.squareup.sdk.mobilepayments.payment.PromptMode;
import com.squareup.sdk.mobilepayments.payment.PromptParameters;

import java.util.Collections;
import java.util.UUID;

/**
 * Tap to Pay on Android inside SlickChart, through Square's Mobile Payments SDK (2026-11-16, Ashley).
 * Same calls as the iPhone plugin (Capacitor.Plugins.SquareTapToPay): status, authorize, linkAccount
 * (nothing to link on Android, resolves linked:true), pay, deauthorize.
 * The access token is the provider's OWN Square OAuth token from /api/square/mobile-auth; it goes
 * straight to the SDK and is never stored here. The public app ID is remembered for the next launch.
 */
@CapacitorPlugin(
    name = "SquareTapToPay",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "phone", strings = { Manifest.permission.READ_PHONE_STATE }),
        @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN })
    }
)
public class SquareTapToPayPlugin extends Plugin {
    static final String PREFS = "sc_square_tap_to_pay";
    static final String APP_ID_KEY = "app_id";
    static boolean initialized = false;
    private boolean paying = false;

    /** Called from SlickChartApplication.onCreate when an earlier session saved the app ID. */
    static void initializeAtLaunch(Application app) {
        if (initialized || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return;
        String id = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(APP_ID_KEY, "");
        if (id == null || id.isEmpty()) return;
        MobilePaymentsSdk.initialize(id, app);
        initialized = true;
    }

    private boolean ensureInitialized(String appId) {
        if (initialized) return true;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false;
        if (appId == null || appId.isEmpty()) return false;
        Application app = getActivity().getApplication();
        SharedPreferences p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        p.edit().putString(APP_ID_KEY, appId).apply();
        MobilePaymentsSdk.initialize(appId, app);
        initialized = true;
        return true;
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P);
        r.put("initialized", initialized);
        boolean capable = false, authorized = false;
        if (initialized) {
            try { capable = MobilePaymentsSdk.readerManager().getTapToPaySettings().isDeviceCapable(); } catch (Exception e) { capable = false; }
            try { authorized = MobilePaymentsSdk.authorizationManager().getAuthorizationState().isAuthorized(); } catch (Exception e) { authorized = false; }
        }
        r.put("capable", capable);
        r.put("authorized", authorized);
        r.put("linked", true);   // Android has no separate terms sheet to accept
        call.resolve(r);
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        final String appId = call.getString("appId");
        final String token = call.getString("accessToken");
        final String locationId = call.getString("locationId");
        if (token == null || token.isEmpty() || locationId == null || locationId.isEmpty()) { call.reject("Missing Square sign-in.", "USAGE"); return; }
        getActivity().runOnUiThread(() -> {
            if (!ensureInitialized(appId)) { call.reject("Square is not set up on this phone.", "NOT_SET_UP"); return; }
            AuthorizationManager auth = MobilePaymentsSdk.authorizationManager();
            if (auth.getAuthorizationState().isAuthorized()) {
                AuthorizedLocation loc = auth.getLocation();
                if (loc != null && locationId.equals(loc.getLocationId())) { JSObject ok = new JSObject(); ok.put("authorized", true); call.resolve(ok); return; }
                // Another account's location on this phone: sign it out first so a payment can never land in the wrong Square.
                auth.deauthorize();
            }
            auth.authorize(token, locationId, result -> {
                if (result instanceof Result.Success) { JSObject ok = new JSObject(); ok.put("authorized", true); call.resolve(ok); }
                else { call.reject(String.valueOf(result.errorMessage()), "AUTH_FAILED"); }
            });
        });
    }

    @PluginMethod
    public void linkAccount(PluginCall call) {
        JSObject ok = new JSObject(); ok.put("linked", true); call.resolve(ok);
    }

    @PluginMethod
    public void pay(PluginCall call) {
        // Square needs location (and, on Android 12+, nearby devices) before it will take a payment.
        if (getPermissionState("location") != PermissionState.GRANTED || getPermissionState("phone") != PermissionState.GRANTED
            || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED)) {
            requestAllPermissions(call, "afterPermissions");
            return;
        }
        startPay(call);
    }

    @PermissionCallback
    private void afterPermissions(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) { call.reject("SlickChart needs location access for card payments. Turn it on in Settings, then try again.", "PERMISSION"); return; }
        startPay(call);
    }

    private void startPay(PluginCall call) {
        final int amount = call.getInt("amountCents", 0);
        final int tip = call.getInt("tipCents", 0);
        if (amount <= 0) { call.reject("Enter an amount first.", "USAGE"); return; }
        String attempt = call.getString("attemptId");
        final String attemptId = (attempt == null || attempt.isEmpty()) ? UUID.randomUUID().toString() : attempt;
        getActivity().runOnUiThread(() -> {
            if (!initialized || !MobilePaymentsSdk.authorizationManager().getAuthorizationState().isAuthorized()) { call.reject("Square is not signed in on this phone yet.", "NOT_AUTHORIZED"); return; }
            if (paying) { call.reject("A payment is already open.", "BUSY"); return; }
            PaymentParameters.Builder b = new PaymentParameters.Builder(new Money(amount, CurrencyCode.USD), ProcessingMode.ONLINE_ONLY, false, attemptId)
                .autocomplete(true);
            if (tip > 0) b.tipMoney(new Money(tip, CurrencyCode.USD));
            String note = call.getString("note");
            if (note != null && !note.isEmpty()) b.note(note.length() > 500 ? note.substring(0, 500) : note);
            String ref = call.getString("referenceId");
            if (ref != null && !ref.isEmpty()) b.referenceId(ref.length() > 40 ? ref.substring(0, 40) : ref);
            PromptParameters prompt = new PromptParameters(PromptMode.DEFAULT, Collections.emptyList());
            paying = true;
            MobilePaymentsSdk.paymentManager().startPaymentActivity(b.build(), prompt, result -> {
                paying = false;
                if (result instanceof Result.Success) {
                    Payment p = ((Result.Success<Payment, PaymentErrorCode>) result).getValue();
                    JSObject r = new JSObject();
                    r.put("status", "completed");
                    r.put("paymentId", p.isOnlinePayment() ? p.asOnlinePayment().getId() : "");
                    r.put("amountCents", p.getAmountMoney().getAmount());
                    r.put("tipCents", p.getTipMoney() != null ? p.getTipMoney().getAmount() : 0);
                    r.put("totalCents", p.getTotalMoney().getAmount());
                    call.resolve(r);
                } else if (result.errorCode() == PaymentErrorCode.CANCELED) {
                    JSObject r = new JSObject(); r.put("status", "canceled"); call.resolve(r);
                } else {
                    call.reject(String.valueOf(result.errorMessage()), "PAYMENT_FAILED");
                }
            });
        });
    }

    @PluginMethod
    public void deauthorize(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try { if (initialized) MobilePaymentsSdk.authorizationManager().deauthorize(); } catch (Exception e) { }
            call.resolve();
        });
    }
}
