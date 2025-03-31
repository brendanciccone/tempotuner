#!/bin/bash

# Create the directory for the keystore
mkdir -p android/keystore

# Generate the keystore file
echo "Generating signing key for TempoTuner Android app..."
keytool -genkey -v \
  -keystore android/keystore/tempotuner-release-key.keystore \
  -alias tempotuner \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000

echo "Keystore created at: android/keystore/tempotuner-release-key.keystore"
echo ""
echo "Now you need to add the following to your android/local.properties file:"
echo ""
echo "STORE_PASSWORD=your_keystore_password"
echo "KEY_ALIAS=tempotuner"
echo "KEY_PASSWORD=your_key_password"
echo ""
echo "Or set these as environment variables:"
echo "ANDROID_STORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD"
echo ""
echo "Then uncomment the signingConfig line in android/app/build.gradle" 