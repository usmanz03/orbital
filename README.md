# Orbital

**Convert any file by holding Shift and dragging it.**

Orbital is a small, free app that lives in your menu bar. Hold **Shift**, start dragging any file, and a round menu opens right under your mouse. Drop the file on what you want (**WebP**, **MP4**, **Compress**, **Merge PDF** and so on) and the new file appears right next to the original.

No websites, no uploads, no extra apps. Everything happens on your own computer, so your files never leave it.

---

## What it can do

- **Images:** convert to PNG, JPG, WebP, AVIF, GIF, PDF or an app icon. Resize, compress, crop to Instagram, LinkedIn and story sizes, rotate, flip, or turn black and white.
- **Videos:** convert to MP4, MOV or WebM, or make a GIF. Shrink a video to under 25 MB, trim it, mute it, change its shape for Reels, speed it up, or pull out the audio.
- **Audio:** convert to MP3, WAV, M4A or FLAC. Make the volume even, cut silences, speed up, trim, or join several files.
- **PDFs:** merge, split, compress, rotate, or save the pages as images or text.
- **Documents:** turn Word, Markdown and web pages into clean PDFs, and convert spreadsheet files between CSV and JSON.
- **Several files at once:** drag a group of files to convert them all, or merge them into one.

That's more than 130 actions in total, and they all work offline.

---

## Get Orbital on your computer

It takes about 10 minutes, and you only do it once. Orbital works on **Mac**, **Windows** and **Linux**.

### Step 1: Install Node.js (free)

Node.js is a free tool that Orbital needs to set itself up.

1. Go to **https://nodejs.org**
2. Click the big **LTS** download button.
3. Open the downloaded file and click through the installer, keeping all the default options.

### Step 2: Download Orbital

1. At the top of this page, click the green **Code** button, then **Download ZIP**.
2. Find the ZIP in your Downloads folder and double-click it to unzip it. You'll get a folder called **orbital-main**.
3. Move that folder somewhere easy to find, like your **Desktop**.

### Step 3: Open a terminal in that folder

A terminal is a window where you can type commands. You only need it for the next two steps.

- **Mac:** open **Terminal** (press ⌘ Space, type *Terminal*, press Enter). Type `cd ` with a space at the end, drag the **orbital-main** folder into the Terminal window, and press **Enter**.
- **Windows:** open the **orbital-main** folder, click the address bar at the top, type `cmd`, and press **Enter**.
- **Linux:** right-click inside the **orbital-main** folder and choose **Open in Terminal**.

### Step 4: Set it up

Copy this line into the terminal and press **Enter**:

```
npm install
```

It downloads what Orbital needs and takes a few minutes. Yellow "warning" messages are normal, so you can ignore them.

### Step 5: Create your app

Copy the line for your computer and press **Enter**:

| Your computer | Type this |
| --- | --- |
| Mac | `npm run dist:mac` |
| Windows | `npm run dist:win` |
| Linux | `npm run dist:linux` |

After a few minutes, a new folder called **dist** appears inside **orbital-main** with your app installer in it.

### Step 6: Install it

- **Mac:** open the **.dmg** file in **dist**, drag **Orbital** into **Applications**, and open it from there.
- **Windows:** open the **.exe** file in **dist** and follow the installer.
- **Linux:** open the **.AppImage** file in **dist**. If it doesn't start, right-click it → Properties → allow it to run as a program. On Ubuntu or Debian you can use the **.deb** file instead.

You can delete the **orbital-main** folder now. Your app is installed.

---

## First time you open it

Orbital doesn't open a window. Look for a small **ring icon** in your menu bar (Mac) or system tray (Windows and Linux).

**On Mac**, two things may come up:

1. **"Orbital needs Accessibility access."** This lets Orbital notice when you drag with Shift held. Click **Open System Settings** and turn on **Orbital**. It only watches mouse movement, never what you type.
2. **"Orbital can't be opened"** or **"Apple could not verify"**. Go to **System Settings → Privacy & Security**, scroll down, and click **Open Anyway**.

**On Windows**, if a blue "Windows protected your PC" box appears, click **More info → Run anyway**.

**Tip:** click the ring icon → **Settings…** → turn on **Open at login**, and Orbital will always be ready.

---

## How to use it

**Shift + drag**
1. Hold **Shift**.
2. Start dragging any file from your desktop or a folder.
3. A round menu appears under your mouse. Move to a category, then drop the file on the option you want.

**Keyboard (Mac)**
1. Select one or more files in Finder.
2. Press **⌘ ⇧ Space**.
3. Type what you want, such as *webp*, *compress* or *pdf*, and press **Enter**.

**Keyboard (Windows and Linux)**
Press **Ctrl + Shift + Space**. A circle appears. Drop your files onto it, then pick an option.

Your new file is saved **next to the original** with a clear name like `photo-1x1.jpg` or `video-25MB.mp4`. Orbital never changes or deletes your original files.

---

## Something not working?

- **Shift + drag does nothing on Mac:** go to **System Settings → Privacy & Security → Accessibility** and check **Orbital** is switched on. Then quit Orbital (ring icon → Quit) and open it again.
- **"npm: command not found":** Node.js isn't installed yet, or the terminal was open while you installed it. Close the terminal, open a new one, and try again.
- **Linux:** Shift + drag needs an "X11" desktop session. On Wayland, use the keyboard shortcut instead.

Questions or ideas? Leave a comment on my LinkedIn post. I'd love to hear what you convert with it.
