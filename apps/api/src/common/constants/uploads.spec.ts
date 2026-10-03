import { isExecutableUpload, isInlineType, storedMimeFor } from './uploads';

// Uploads are served from the app's own origin, so a file the browser runs as a
// document can read the tokens in localStorage. These pin the line between
// "material" and "page".
describe('upload safety', () => {
  it('refuses what a browser would execute as a document', () => {
    for (const name of [
      'takeover.html',
      'takeover.HTM',
      'takeover.xhtml',
      'logo.svg',
      'sheet.xsl',
      'script.js',
      'shell.php',
    ]) {
      expect(isExecutableUpload(name, 'application/octet-stream')).toBe(true);
    }
  });

  it('refuses by declared type too, when the name is dressed up', () => {
    // A client picks the extension AND the type; neither may be trusted alone.
    expect(isExecutableUpload('innocent.png', 'text/html')).toBe(true);
    expect(isExecutableUpload('innocent.jpg', 'image/svg+xml')).toBe(true);
  });

  it('leaves the material a lesson actually uses alone', () => {
    const ok: [string, string][] = [
      ['photo.jpg', 'image/jpeg'],
      ['photo.PNG', 'image/png'],
      ['dialogue.mp3', 'audio/mpeg'],
      ['clip.mp4', 'video/mp4'],
      ['worksheet.pdf', 'application/pdf'],
      ['handout.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['table.xlsx', 'application/vnd.ms-excel'],
      ['notes.txt', 'text/plain'],
    ];
    for (const [name, mime] of ok) expect(isExecutableUpload(name, mime)).toBe(false);
  });

  it('shows media in place and downloads everything else', () => {
    expect(isInlineType('image/png')).toBe(true);
    expect(isInlineType('audio/mpeg')).toBe(true);
    expect(isInlineType('video/mp4')).toBe(true);
    expect(isInlineType('application/pdf')).toBe(true);
    expect(isInlineType('text/plain')).toBe(false);
    expect(isInlineType('application/octet-stream')).toBe(false);
  });

  it('types a stored file from its extension, and shrugs at unknown ones', () => {
    expect(storedMimeFor('a1b2.jpg')).toBe('image/jpeg');
    expect(storedMimeFor('a1b2.MP3')).toBe('audio/mpeg');
    // Unknown -> octet-stream, which the static handler then sends as a
    // download rather than guessing.
    expect(storedMimeFor('a1b2.docx')).toBe('application/octet-stream');
    expect(storedMimeFor('noextension')).toBe('application/octet-stream');
  });
});
