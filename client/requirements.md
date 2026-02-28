## Packages
(none needed)

## Notes
- App uses `navigator.mediaDevices.getUserMedia` which requires a secure context (HTTPS) or localhost.
- App leverages a hidden 64x64 canvas for performant pixel sampling of the video stream.
- Ensure the backend correctly implements the @shared/routes API endpoints.
