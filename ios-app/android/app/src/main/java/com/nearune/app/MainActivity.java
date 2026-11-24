package com.nearune.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Our own small plugin (see MetaEventsPlugin) must be registered
        // before the bridge starts.
        registerPlugin(MetaEventsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
