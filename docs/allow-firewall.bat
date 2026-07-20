@echo off
echo Adding Windows Firewall rule for Vorm Jr. Upload Server (port 8080)...
netsh advfirewall firewall add rule name="Vorm Jr Upload Server" dir=in action=allow protocol=TCP localport=8080
echo.
echo Done! Other devices on the network can now connect.
echo You can remove this rule later with:
echo   netsh advfirewall firewall delete rule name="Vorm Jr Upload Server"
echo.
pause
