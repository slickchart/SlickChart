import Foundation
import UIKit
import Capacitor
import SquareMobilePaymentsSDK

// Tap to Pay on iPhone inside SlickChart, through Square's Mobile Payments SDK (2026-11-16, Ashley).
//
// The web app (slickchart.html) calls this as Capacitor.Plugins.SquareTapToPay:
//   status()                         -> { available, capable, authorized, linked, initialized }
//   authorize({appId, accessToken, locationId}) -> { authorized }
//   linkAccount()                    -> { linked }   (Apple's Tap to Pay terms sheet, once per merchant)
//   pay({amountCents, tipCents, note, referenceId, attemptId}) -> { status, paymentId, amountCents, tipCents, totalCents }
//   deauthorize()                    -> {}           (on sign-out, so the next account never inherits it)
//
// The access token is the provider's OWN Square OAuth token from /api/square/mobile-auth (her session).
// It is handed straight to the SDK and never stored by this plugin. The app ID (public, sq0idp-...) is
// remembered so the SDK can be started at launch next time, as Square recommends.
@objc(SquareTapToPayPlugin)
public class SquareTapToPayPlugin: CAPPlugin, CAPBridgedPlugin, PaymentManagerDelegate {
    public let identifier = "SquareTapToPayPlugin"
    public let jsName = "SquareTapToPay"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "linkAccount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pay", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deauthorize", returnType: CAPPluginReturnPromise)
    ]

    static let appIdKey = "sc_square_app_id"
    static var initialized = false
    private var payCall: CAPPluginCall?

    /// Called from AppDelegate at launch when an app ID was saved by an earlier session.
    static func initializeAtLaunch(_ launchOptions: [UIApplication.LaunchOptionsKey: Any]?) {
        guard !initialized, let appId = UserDefaults.standard.string(forKey: appIdKey), !appId.isEmpty else { return }
        MobilePaymentsSDK.initialize(applicationLaunchOptions: launchOptions, squareApplicationID: appId)
        initialized = true
    }

    private func ensureInitialized(_ appId: String?) -> Bool {
        if SquareTapToPayPlugin.initialized { return true }
        guard let appId = appId, !appId.isEmpty else { return false }
        UserDefaults.standard.set(appId, forKey: SquareTapToPayPlugin.appIdKey)
        MobilePaymentsSDK.initialize(applicationLaunchOptions: nil, squareApplicationID: appId)
        SquareTapToPayPlugin.initialized = true
        return true
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard SquareTapToPayPlugin.initialized else {
                call.resolve(["available": true, "initialized": false, "capable": false, "authorized": false, "linked": false])
                return
            }
            let sdk = MobilePaymentsSDK.shared
            let capable = sdk.readerManager.tapToPaySettings.isDeviceCapable
            let authorized = sdk.authorizationManager.state == .authorized
            if !capable || !authorized {
                call.resolve(["available": true, "initialized": true, "capable": capable, "authorized": authorized, "linked": false])
                return
            }
            sdk.readerManager.tapToPaySettings.isAppleAccountLinked { linked, _ in
                DispatchQueue.main.async {
                    call.resolve(["available": true, "initialized": true, "capable": capable, "authorized": authorized, "linked": linked])
                }
            }
        }
    }

    @objc func authorize(_ call: CAPPluginCall) {
        let appId = call.getString("appId")
        guard let token = call.getString("accessToken"), !token.isEmpty,
              let locationId = call.getString("locationId"), !locationId.isEmpty else {
            call.reject("Missing Square sign-in.", "USAGE")
            return
        }
        DispatchQueue.main.async {
            guard self.ensureInitialized(appId) else { call.reject("Square is not set up.", "NOT_SET_UP"); return }
            let auth = MobilePaymentsSDK.shared.authorizationManager
            // Already signed in to THIS location: nothing to do. A different location (another account
            // on the same phone) is signed out first, so payments can never land in the wrong Square.
            if auth.state == .authorized {
                if auth.location?.id == locationId { call.resolve(["authorized": true]); return }
                auth.deauthorize {
                    DispatchQueue.main.async { self.doAuthorize(call, token: token, locationId: locationId) }
                }
                return
            }
            self.doAuthorize(call, token: token, locationId: locationId)
        }
    }

    private func doAuthorize(_ call: CAPPluginCall, token: String, locationId: String) {
        MobilePaymentsSDK.shared.authorizationManager.authorize(accessToken: token, locationID: locationId) { error in
            DispatchQueue.main.async {
                if let error = error { call.reject(error.localizedDescription, "AUTH_FAILED") }
                else { call.resolve(["authorized": true]) }
            }
        }
    }

    @objc func linkAccount(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard SquareTapToPayPlugin.initialized else { call.reject("Square is not set up.", "NOT_SET_UP"); return }
            let settings = MobilePaymentsSDK.shared.readerManager.tapToPaySettings
            guard settings.isDeviceCapable else { call.reject("This iPhone can't take Tap to Pay. It needs an iPhone XS or newer on iOS 16.7 or later.", "NOT_CAPABLE"); return }
            settings.linkAppleAccount { error in
                DispatchQueue.main.async {
                    if let error = error as NSError?, error.code != TapToPayReaderError.alreadyLinked.rawValue {
                        call.reject(error.localizedDescription, error.code == TapToPayReaderError.linkingCanceled.rawValue ? "CANCELED" : "LINK_FAILED")
                    } else {
                        call.resolve(["linked": true])
                    }
                }
            }
        }
    }

    @objc func pay(_ call: CAPPluginCall) {
        let amount = call.getInt("amountCents") ?? 0
        let tip = call.getInt("tipCents") ?? 0
        guard amount > 0 else { call.reject("Enter an amount first.", "USAGE"); return }
        let attemptId = call.getString("attemptId") ?? UUID().uuidString
        DispatchQueue.main.async {
            guard SquareTapToPayPlugin.initialized,
                  MobilePaymentsSDK.shared.authorizationManager.state == .authorized else {
                call.reject("Square is not signed in on this phone yet.", "NOT_AUTHORIZED"); return
            }
            guard self.payCall == nil else { call.reject("A payment is already open.", "BUSY"); return }
            guard let vc = self.bridge?.viewController else { call.reject("The app is not ready.", "NO_VIEW"); return }
            let params = PaymentParameters(paymentAttemptID: attemptId,
                                           amountMoney: Money(amount: UInt(amount), currency: .USD),
                                           processingMode: .onlineOnly)
            if tip > 0 { params.tipMoney = Money(amount: UInt(tip), currency: .USD) }
            params.autocomplete = true
            if let note = call.getString("note"), !note.isEmpty { params.note = String(note.prefix(500)) }
            if let ref = call.getString("referenceId"), !ref.isEmpty { params.referenceID = String(ref.prefix(40)) }
            let prompt = PromptParameters(mode: .default, additionalMethods: AdditionalPaymentMethods())
            self.payCall = call
            let handle = MobilePaymentsSDK.shared.paymentManager.startPayment(params, promptParameters: prompt, from: vc, delegate: self)
            if handle == nil { self.payCall = nil; call.reject("Square could not start the payment.", "START_FAILED") }
        }
    }

    @objc func deauthorize(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard SquareTapToPayPlugin.initialized,
                  MobilePaymentsSDK.shared.authorizationManager.state != .notAuthorized else { call.resolve(); return }
            MobilePaymentsSDK.shared.authorizationManager.deauthorize { call.resolve() }
        }
    }

    // MARK: PaymentManagerDelegate
    public func paymentManager(_ paymentManager: PaymentManager, didFinish payment: Payment) {
        guard let call = payCall else { return }
        payCall = nil
        call.resolve([
            "status": "completed",
            "paymentId": payment.id ?? "",
            "amountCents": Int(payment.amountMoney.amount),
            "tipCents": Int(payment.tipMoney?.amount ?? 0),
            "totalCents": Int(payment.totalMoney.amount)
        ])
    }

    public func paymentManager(_ paymentManager: PaymentManager, didFail payment: Payment, withError error: Error) {
        guard let call = payCall else { return }
        payCall = nil
        call.reject(error.localizedDescription, "PAYMENT_FAILED")
    }

    public func paymentManager(_ paymentManager: PaymentManager, didCancel payment: Payment) {
        guard let call = payCall else { return }
        payCall = nil
        call.resolve(["status": "canceled"])
    }
}
