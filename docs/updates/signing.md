# Update Signing

Updater signatures authenticate artifacts inside the updater protocol. Windows Authenticode
establishes publisher identity and reputation for Windows/SmartScreen; it is separate. ForgeKi's
current EXE/MSI/NSIS outputs are not Authenticode signed, and updater signing is not production-configured.
No production private signing key is committed.
