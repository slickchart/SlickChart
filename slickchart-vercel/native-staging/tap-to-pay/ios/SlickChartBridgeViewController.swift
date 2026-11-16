import UIKit
import Capacitor

// The app's own bridge view controller, so plugins that live inside the App target (not in an npm
// package) are registered with Capacitor. Today: SquareTapToPayPlugin.
class SlickChartBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SquareTapToPayPlugin())
    }
}
