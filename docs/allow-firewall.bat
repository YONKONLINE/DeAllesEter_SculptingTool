@echo off
echo Adding Windows Firewall rules for Vorm Jr...
echo   - Upload Server (port 8080)
netsh advfirewall firewall add rule name="Vorm Jr Upload Server" dir=in action=allow protocol=TCP localport=8080
echo   - App Server    (port 8000)
netsh advfirewall firewall add rule name="Vorm Jr App Server"    dir=in action=allow protocol=TCP localport=8000
echo.
echo Done! Other devices on the network can now connect.
echo You can remove these rules later with:
echo   netsh advfirewall firewall delete rule name="Vorm Jr Upload Server"
echo   netsh advfirewall firewall delete rule name="Vorm Jr App Server"
echo.
pause
