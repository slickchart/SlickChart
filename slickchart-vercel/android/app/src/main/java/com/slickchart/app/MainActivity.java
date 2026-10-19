package com.slickchart.app;

import android.annotation.TargetApi;
import android.os.Build;
import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android can kill the web page's renderer to free memory (most often on a busy, older phone
        // with the camera open). Left unhandled, that takes the whole app down. Rebuild the screen
        // instead: the page reloads and the app's own drafts and offline store bring her back.
        if (bridge != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            bridge.addWebViewListener(new WebViewListener() {
                @Override
                @TargetApi(Build.VERSION_CODES.O)
                public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                    runOnUiThread(MainActivity.this::recreate);
                    return true;
                }
            });
        }
    }
}
