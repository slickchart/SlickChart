#!/usr/bin/env node
// Switches Tap to Pay (Square Mobile Payments SDK 2.7.0) ON in the native projects.
//
//   node scripts/native/tap-to-pay.cjs enable   [--ios] [--android]   (both when neither is given)
//   node scripts/native/tap-to-pay.cjs check                          (prints what is/isn't applied)
//
// Run it ONLY for the store build that is meant to carry Tap to Pay:
//  - iPhone: Apple's Tap to Pay entitlement must be approved for the App Store distribution type
//    (the first approval, 2026-11-16, is Development only; an App Store archive with the
//    entitlement fails until Apple's second yes). The capability must be ticked on the App ID and
//    the "SlickChart App Store" profile regenerated, or signing fails.
//  - Android: Square needs the app's signing certificate before production payments work.
// It raises the iOS minimum to 17.1 and Android's to API 28 (Square's floors). Phones below that
// keep the version they have, which keeps working because the app's code is served live.
// Every edit is idempotent: running it twice changes nothing the second time.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const STAGE = path.join(ROOT, 'native-staging', 'tap-to-pay');
const IOS = path.join(ROOT, 'ios', 'App');
const AND = path.join(ROOT, 'android');
const SDK_VERSION = '2.7.0';

const args = process.argv.slice(2);
const mode = args[0] || 'check';
let doIos = args.includes('--ios'), doAnd = args.includes('--android');
if (!doIos && !doAnd) doIos = doAnd = true;

const report = [];
function edit(file, label, has, apply) {
  const src = fs.readFileSync(file, 'utf8');
  if (has(src)) { report.push(['ok', label]); return; }
  if (mode !== 'enable') { report.push(['--', label]); return; }
  const out = apply(src);
  if (out === src || !has(out)) throw new Error('Could not apply: ' + label + ' (' + path.relative(ROOT, file) + ')');
  fs.writeFileSync(file, out);
  report.push(['++', label]);
}
function copy(from, to, label) {
  const want = fs.readFileSync(from, 'utf8');
  const have = fs.existsSync(to) ? fs.readFileSync(to, 'utf8') : null;
  if (have === want) { report.push(['ok', label]); return; }
  if (mode !== 'enable') { report.push(['--', label]); return; }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, want);
  report.push(['++', label]);
}
function insertAfter(src, anchor, text) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error('anchor not found: ' + anchor.slice(0, 60));
  return src.slice(0, i + anchor.length) + text + src.slice(i + anchor.length);
}

// ---------- iOS ----------
function ios() {
  const A = path.join(IOS, 'App');
  copy(path.join(STAGE, 'ios', 'SquareTapToPayPlugin.swift'), path.join(A, 'SquareTapToPayPlugin.swift'), 'iOS: plugin source');
  copy(path.join(STAGE, 'ios', 'SlickChartBridgeViewController.swift'), path.join(A, 'SlickChartBridgeViewController.swift'), 'iOS: bridge view controller');

  const P = path.join(IOS, 'App.xcodeproj', 'project.pbxproj');
  const ID = {
    plugRef: '7A70000000000000000000A1', plugBuild: '7A70000000000000000000A2',
    bvcRef: '7A70000000000000000000A3', bvcBuild: '7A70000000000000000000A4',
    pkg: '7A70000000000000000000A5', prod: '7A70000000000000000000A6', prodBuild: '7A70000000000000000000A7',
    script: '7A70000000000000000000A8',
  };
  edit(P, 'iOS: source files in the project', s => s.includes(ID.plugBuild), s => {
    s = s.replace('/* End PBXBuildFile section */',
      `\t\t${ID.plugBuild} /* SquareTapToPayPlugin.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ID.plugRef} /* SquareTapToPayPlugin.swift */; };\n` +
      `\t\t${ID.bvcBuild} /* SlickChartBridgeViewController.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${ID.bvcRef} /* SlickChartBridgeViewController.swift */; };\n` +
      `\t\t${ID.prodBuild} /* SquareMobilePaymentsSDK in Frameworks */ = {isa = PBXBuildFile; productRef = ${ID.prod} /* SquareMobilePaymentsSDK */; };\n` +
      '/* End PBXBuildFile section */');
    s = s.replace('/* End PBXFileReference section */',
      `\t\t${ID.plugRef} /* SquareTapToPayPlugin.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = SquareTapToPayPlugin.swift; sourceTree = "<group>"; };\n` +
      `\t\t${ID.bvcRef} /* SlickChartBridgeViewController.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = SlickChartBridgeViewController.swift; sourceTree = "<group>"; };\n` +
      '/* End PBXFileReference section */');
    s = insertAfter(s, '504EC3071FED79650016851F /* AppDelegate.swift */,\n',
      `\t\t\t\t${ID.plugRef} /* SquareTapToPayPlugin.swift */,\n\t\t\t\t${ID.bvcRef} /* SlickChartBridgeViewController.swift */,\n`);
    s = insertAfter(s, '504EC3081FED79650016851F /* AppDelegate.swift in Sources */,\n',
      `\t\t\t\t${ID.plugBuild} /* SquareTapToPayPlugin.swift in Sources */,\n\t\t\t\t${ID.bvcBuild} /* SlickChartBridgeViewController.swift in Sources */,\n`);
    return s;
  });
  edit(P, 'iOS: Square SDK package ' + SDK_VERSION, s => s.includes(ID.pkg), s => {
    s = s.replace(/(packageReferences = \(\n\t\t\t\tD4C12C0A2AAA248700AAC8A2 \/\* XCLocalSwiftPackageReference "CapApp-SPM" \*\/,\n)/,
      `$1\t\t\t\t${ID.pkg} /* XCRemoteSwiftPackageReference "mobile-payments-sdk-ios" */,\n`);
    s = s.replace(/(packageProductDependencies = \(\n\t\t\t\t4D22ABE82AF431CB00220026 \/\* CapApp-SPM \*\/,\n)/,
      `$1\t\t\t\t${ID.prod} /* SquareMobilePaymentsSDK */,\n`);
    s = s.replace('/* End XCLocalSwiftPackageReference section */',
      '/* End XCLocalSwiftPackageReference section */\n\n/* Begin XCRemoteSwiftPackageReference section */\n' +
      `\t\t${ID.pkg} /* XCRemoteSwiftPackageReference "mobile-payments-sdk-ios" */ = {\n` +
      '\t\t\tisa = XCRemoteSwiftPackageReference;\n\t\t\trepositoryURL = "https://github.com/square/mobile-payments-sdk-ios";\n' +
      `\t\t\trequirement = {\n\t\t\t\tkind = exactVersion;\n\t\t\t\tversion = ${SDK_VERSION};\n\t\t\t};\n\t\t};\n` +
      '/* End XCRemoteSwiftPackageReference section */');
    s = s.replace('/* End XCSwiftPackageProductDependency section */',
      `\t\t${ID.prod} /* SquareMobilePaymentsSDK */ = {\n\t\t\tisa = XCSwiftPackageProductDependency;\n` +
      `\t\t\tpackage = ${ID.pkg} /* XCRemoteSwiftPackageReference "mobile-payments-sdk-ios" */;\n` +
      '\t\t\tproductName = SquareMobilePaymentsSDK;\n\t\t};\n/* End XCSwiftPackageProductDependency section */');
    // Link it in the Frameworks phase.
    s = s.replace(/(isa = PBXFrameworksBuildPhase;\n\t\t\tbuildActionMask = \d+;\n\t\t\tfiles = \(\n)/,
      `$1\t\t\t\t${ID.prodBuild} /* SquareMobilePaymentsSDK in Frameworks */,\n`);
    return s;
  });
  // Square's required setup script, as the LAST build phase.
  edit(P, 'iOS: Square setup build phase (last)', s => s.includes(ID.script), s => {
    s = s.replace('504EC3021FED79650016851F /* Resources */,\n\t\t\t);',
      `504EC3021FED79650016851F /* Resources */,\n\t\t\t\t${ID.script} /* Square SDK setup */,\n\t\t\t);`);
    const phase = '/* Begin PBXShellScriptBuildPhase section */\n' +
      `\t\t${ID.script} /* Square SDK setup */ = {\n\t\t\tisa = PBXShellScriptBuildPhase;\n\t\t\talwaysOutOfDate = 1;\n` +
      '\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n\t\t\t);\n\t\t\tinputFileListPaths = (\n\t\t\t);\n\t\t\tinputPaths = (\n\t\t\t);\n' +
      '\t\t\tname = "Square SDK setup";\n\t\t\toutputFileListPaths = (\n\t\t\t);\n\t\t\toutputPaths = (\n\t\t\t);\n' +
      '\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t\tshellPath = /bin/sh;\n' +
      '\t\t\tshellScript = "\\"${BUILT_PRODUCTS_DIR}/${FRAMEWORKS_FOLDER_PATH}/SquareMobilePaymentsSDK.framework/setup\\"\\n";\n' +
      '\t\t};\n/* End PBXShellScriptBuildPhase section */\n\n';
    return s.replace('/* Begin PBXSourcesBuildPhase section */', phase + '/* Begin PBXSourcesBuildPhase section */');
  });
  edit(P, 'iOS: minimum iOS 17.1', s => !/IPHONEOS_DEPLOYMENT_TARGET = 1[0-6]\./.test(s),
    s => s.replace(/IPHONEOS_DEPLOYMENT_TARGET = 1[0-6]\.\d+;/g, 'IPHONEOS_DEPLOYMENT_TARGET = 17.1;'));
  edit(P, 'iOS: user script sandboxing off (Square setup needs it)', s => (s.match(/ENABLE_USER_SCRIPT_SANDBOXING = NO;/g) || []).length >= 2,
    s => s.replace(/ENABLE_USER_SCRIPT_SANDBOXING = YES;\n/g, '').replace(/(CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;\n)/g, '$1\t\t\t\tENABLE_USER_SCRIPT_SANDBOXING = NO;\n'));

  const PL = path.join(A, 'Info.plist');
  edit(PL, 'iOS: Bluetooth wording', s => s.includes('NSBluetoothAlwaysUsageDescription'), s =>
    s.replace(/<dict>\n/, '<dict>\n\t<key>NSBluetoothAlwaysUsageDescription</key>\n\t<string>SlickChart uses Bluetooth to connect a Square card reader when you take a payment.</string>\n'));
  edit(PL, 'iOS: location wording', s => s.includes('NSLocationWhenInUseUsageDescription'), s =>
    s.replace(/<dict>\n/, '<dict>\n\t<key>NSLocationWhenInUseUsageDescription</key>\n\t<string>Square needs your location to take card payments safely, as card networks require.</string>\n'));

  const EN = path.join(A, 'App.entitlements');
  edit(EN, 'iOS: Tap to Pay entitlement', s => s.includes('com.apple.developer.proximity-reader.payment.acceptance'), s =>
    s.replace(/<\/dict>\s*<\/plist>\s*$/, '\t<key>com.apple.developer.proximity-reader.payment.acceptance</key>\n\t<true/>\n</dict>\n</plist>\n'));

  const SD = path.join(A, 'SceneDelegate.swift');
  edit(SD, 'iOS: app screen registers the plugin', s => s.includes('SlickChartBridgeViewController()'),
    s => s.replace('rootViewController = CAPBridgeViewController()', 'rootViewController = SlickChartBridgeViewController()'));
  const AD = path.join(A, 'AppDelegate.swift');
  edit(AD, 'iOS: Square starts at launch', s => s.includes('SquareTapToPayPlugin.initializeAtLaunch'),
    s => s.replace('// Override point for customization after application launch.\n',
      '// Override point for customization after application launch.\n        SquareTapToPayPlugin.initializeAtLaunch(launchOptions)\n'));
}

// ---------- Android ----------
function android() {
  const JAVA = path.join(AND, 'app', 'src', 'main', 'java', 'com', 'slickchart', 'app');
  copy(path.join(STAGE, 'android', 'SquareTapToPayPlugin.java'), path.join(JAVA, 'SquareTapToPayPlugin.java'), 'Android: plugin source');
  copy(path.join(STAGE, 'android', 'SlickChartApplication.java'), path.join(JAVA, 'SlickChartApplication.java'), 'Android: application class');

  edit(path.join(AND, 'variables.gradle'), 'Android: minimum API 28', s => !/minSdkVersion = 2[0-7]\b/.test(s),
    s => s.replace(/minSdkVersion = 2[0-7]\b/, 'minSdkVersion = 28'));
  const BG = path.join(AND, 'app', 'build.gradle');
  edit(BG, 'Android: Square maven repository', s => s.includes('sdk.squareup.com/public/android'),
    s => s.replace(/repositories \{\n/, "repositories {\n    maven { url 'https://sdk.squareup.com/public/android/' }\n"));
  edit(BG, 'Android: Square SDK ' + SDK_VERSION, s => s.includes('com.squareup.sdk:mobile-payments-sdk'),
    s => s.replace(/dependencies \{\n/, `dependencies {\n    implementation "com.squareup.sdk:mobile-payments-sdk:${SDK_VERSION}"\n`));
  const MF = path.join(AND, 'app', 'src', 'main', 'AndroidManifest.xml');
  edit(MF, 'Android: application class in the manifest', s => s.includes('android:name=".SlickChartApplication"'),
    s => s.replace('<application', '<application\n        android:name=".SlickChartApplication"'));
  edit(MF, 'Android: tools namespace', s => s.includes('xmlns:tools='),
    s => s.replace('<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" '));
  // Square's SDK declares the microphone REQUIRED; keep it optional so Play doesn't hide the app
  // from tablets and Chromebooks without one.
  edit(MF, 'Android: microphone stays optional', s => /android\.hardware\.microphone"\s+android:required="false"\s+tools:replace="android:required"/.test(s),
    s => s.replace(/<uses-feature android:name="android\.hardware\.microphone" android:required="false" \/>/,
      '<uses-feature android:name="android.hardware.microphone" android:required="false" tools:replace="android:required" />'));
  const MA = path.join(JAVA, 'MainActivity.java');
  edit(MA, 'Android: plugin registered', s => s.includes('registerPlugin(SquareTapToPayPlugin.class)'),
    s => s.replace('protected void onCreate(Bundle savedInstanceState) {\n', 'protected void onCreate(Bundle savedInstanceState) {\n        registerPlugin(SquareTapToPayPlugin.class);\n'));
}

if (!['enable', 'check'].includes(mode)) { console.error('usage: tap-to-pay.cjs enable|check [--ios] [--android]'); process.exit(2); }
try { if (doIos) ios(); if (doAnd) android(); }
catch (e) { console.error('FAILED: ' + e.message); for (const [m, l] of report) console.error(m + ' ' + l); process.exit(1); }
for (const [m, l] of report) console.log(m + ' ' + l);
const missing = report.filter(r => r[0] === '--').length;
console.log(mode === 'check' ? (missing ? missing + ' step(s) not applied (Tap to Pay is OFF in this build)' : 'Tap to Pay is fully applied') : 'Done. Run it again with "check" to confirm.');
