package com.nearune.app;

import android.os.Bundle;

import com.facebook.appevents.AppEventsConstants;
import com.facebook.appevents.AppEventsLogger;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Lets the Nearune web pages tell Meta that someone finished signing up
// ("Complete registration"), so ad campaigns can optimize for real sign-ups
// instead of installs. Sends only how they signed up (room, invite or
// Make a friend) — never a name, email or city.
@CapacitorPlugin(name = "MetaEvents")
public class MetaEventsPlugin extends Plugin {
    @PluginMethod
    public void logRegistration(PluginCall call) {
        try {
            String method = call.getString("method", "room");
            Bundle params = new Bundle();
            params.putString(AppEventsConstants.EVENT_PARAM_REGISTRATION_METHOD, method);
            AppEventsLogger.newLogger(getContext()).logEvent(AppEventsConstants.EVENT_NAME_COMPLETED_REGISTRATION, params);
        } catch (Exception e) {
            // Never let ad measurement get in the way of the app.
        }
        call.resolve();
    }

    // Any Meta app event the web pages ask for (1.0.5+), so new events (like
    // "invite sent") never need a new app build. Takes Meta's raw event name
    // and plain text parameters only — never a name, email or city.
    @PluginMethod
    public void logEvent(PluginCall call) {
        try {
            String name = call.getString("name", "");
            if (name == null || !name.matches("[A-Za-z0-9_ ]{1,40}")) { call.resolve(); return; }
            Bundle params = new Bundle();
            JSObject p = call.getObject("params", new JSObject());
            if (p != null) {
                java.util.Iterator<String> keys = p.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    String v = p.optString(k, "");
                    if (k.matches("[A-Za-z0-9_]{1,40}") && v.length() <= 100) params.putString(k, v);
                }
            }
            AppEventsLogger.newLogger(getContext()).logEvent(name, params);
        } catch (Exception e) {
            // Never let ad measurement get in the way of the app.
        }
        call.resolve();
    }
}
