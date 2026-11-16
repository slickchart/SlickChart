package com.slickchart.app;

import android.app.Application;

// Starts Square's Mobile Payments SDK at launch (Square requires it in Application.onCreate) once a
// provider has used Tap to Pay on this phone before. Before that, the plugin starts it on first use.
public class SlickChartApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        try { SquareTapToPayPlugin.initializeAtLaunch(this); } catch (Throwable t) { /* never block launch */ }
    }
}
