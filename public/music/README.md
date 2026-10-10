# Soundtrack

Songs that play on the menus (not during games), with a "Now Playing" pop-up.

## Where files go

- **Songs:** MP3 files in this folder, `public/music/` (for example `public/music/friday-lights.mp3`)
- **Cover images:** JPG, PNG or WebP files in `public/music/covers/` (square, about 300 x 300 px is plenty)

Use lowercase file names without spaces (`friday-lights.mp3`, not `Friday Lights.mp3`): they become web addresses.

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

Everything here is published with the game on the public site (and in the public GitHub repository). Only add music
you have the right to share: your own, royalty-free or Creative Commons tracks (credit the artist when the license
asks), or AI-generated tracks your plan allows for public use. Commercial songs from artists and labels can't go here.
