import UIKit
import Capacitor
import FacebookCore

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = NearuneBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}


// The app's web view, plus our own small plugin (MetaEventsPlugin below).
class NearuneBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MetaEventsPlugin())
    }
}

// Lets the Nearune web pages tell Meta that someone finished signing up
// ("Complete registration"), so ad campaigns can optimize for real sign-ups
// instead of installs. Sends only how they signed up (room, invite or
// Make a friend), never a name, email or city.
@objc(MetaEventsPlugin)
public class MetaEventsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MetaEventsPlugin"
    public let jsName = "MetaEvents"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "logRegistration", returnType: CAPPluginReturnPromise)
    ]

    @objc func logRegistration(_ call: CAPPluginCall) {
        let method = call.getString("method") ?? "room"
        DispatchQueue.main.async {
            AppEvents.shared.logEvent(.completedRegistration, parameters: [.registrationMethod: method])
        }
        call.resolve()
    }
}
