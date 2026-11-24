package com.nearune.app;

import android.os.Bundle;

import com.facebook.appevents.AppEventsConstants;
import com.facebook.appevents.AppEventsLogger;
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
}
