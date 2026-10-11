# Soundtrack

Songs that play on the menus (not during games), with a "Now Playing" pop-up.

## Where files go

- **Songs:** MP3 files in this folder, `public/music/` (for example `public/music/friday-lights.mp3`). They're for
  the dev server only: git ignores them, builds drop them, and the live game streams them from the music server
  (`music-worker/`, see its README for uploading)
- **Cover images:** JPG, PNG or WebP files in `public/music/covers/` (square, about 300 x 300 px is plenty)

Any file name works (the game encodes it). Keep the name you upload to the music server: the two must match.

## Size

- Aim for 128-192 kbps MP3s (about 3-5 MB for a 3-minute song). Larger files take longer to start on phones.
- Each file must be under 25 MB (the hosting limit).

## The song list

`soundtrack.json` (in this folder) has the steps and examples at the top; add songs to its `songs` list:

```json
"songs": [
  { "file": "friday-lights.mp3", "title": "Friday Lights", "artist": "The Sidelines", "cover": "friday-lights.jpg" }
]
```

- `file`: the MP3's name in this folder
- `title` and `artist`: shown in the Now Playing pop-up
- `cover`: the image's name in `covers/` (optional: without one, the pop-up shows the song's initials)
- `intro`: `true` on the song that opens the game, playing on the title screen when the game loads (optional; one
  song). After it, it joins the shuffle with the rest.

```json
{ "file": "main-theme.mp3", "title": "Main Theme", "artist": "The Sidelines", "cover": "main-theme.jpg", "intro": true }
```

## Rights

The MP3s are never published as files: they're kept out of git and the site, and streamed to the game only by the
music server. The song list (`soundtrack.json`), the covers and this folder's notes are public. Only use music your
license allows in a public game (for Uppbeat tracks, check that your plan covers games), and credit artists as the
license asks: the Now Playing pop-up shows each song's title and artist.
