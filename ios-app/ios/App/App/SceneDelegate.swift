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


// The app's web view, plus our own small plugins (MetaEventsPlugin and
// NearuneSharePlugin below).
class NearuneBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(MetaEventsPlugin())
        bridge?.registerPluginInstance(NearuneSharePlugin())
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
        CAPPluginMethod(name: "logRegistration", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logEvent", returnType: CAPPluginReturnPromise)
    ]

    @objc func logRegistration(_ call: CAPPluginCall) {
        let method = call.getString("method") ?? "room"
        DispatchQueue.main.async {
            AppEvents.shared.logEvent(.completedRegistration, parameters: [.registrationMethod: method])
        }
        call.resolve()
    }

    // Any Meta app event the web pages ask for (1.0.5+), so new events (like
    // "invite sent") never need a new app build. Takes Meta's raw event name
    // and plain text parameters only, never a name, email or city.
    @objc func logEvent(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? ""
        let okName = name.range(of: "^[A-Za-z0-9_ ]{1,40}$", options: .regularExpression) != nil
        if !okName { call.resolve(); return }
        var params: [AppEvents.ParameterName: Any] = [:]
        if let raw = call.getObject("params") {
            for (k, v) in raw {
                if let s = v as? String, s.count <= 100, k.range(of: "^[A-Za-z0-9_]{1,40}$", options: .regularExpression) != nil {
                    params[AppEvents.ParameterName(rawValue: k)] = s
                }
            }
        }
        DispatchQueue.main.async {
            AppEvents.shared.logEvent(AppEvents.Name(rawValue: name), parameters: params)
        }
        call.resolve()
    }
}

// Opens the iPhone share sheet with the invite message (a short personal line,
// today's question and the link). The web share sheet inside the app flashed
// closed whenever text was included (Nov 14, 2026), so invites from the
// iPhone app had to go out as a bare link; this native sheet doesn't.
@objc(NearuneSharePlugin)
public class NearuneSharePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NearuneSharePlugin"
    public let jsName = "NearuneShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise)
    ]

    @objc func share(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        if text.isEmpty { call.reject("nothing to share"); return }
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else { call.reject("no view"); return }
            let sheet = UIActivityViewController(activityItems: [text], applicationActivities: nil)
            // iPad shows the sheet as a popover, which needs an anchor.
            if let pop = sheet.popoverPresentationController {
                pop.sourceView = vc.view
                pop.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.maxY - 80, width: 1, height: 1)
                pop.permittedArrowDirections = []
            }
            sheet.completionWithItemsHandler = { activity, completed, _, _ in
                call.resolve(["completed": completed, "activity": activity?.rawValue ?? ""])
            }
            vc.present(sheet, animated: true)
        }
    }
}
