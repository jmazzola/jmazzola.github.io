// Decorative hex dump for the home hero: a real-looking PE/DOS header whose
// classic stub message has been patched. Bytes are computed from the text so
// the hex and ASCII columns always agree.
const image = Buffer.alloc(0x80, 0);

// IMAGE_DOS_HEADER essentials
Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00,
             0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00]).copy(image, 0x00);
Buffer.from([0xb8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
             0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]).copy(image, 0x10);
image.writeUInt32LE(0x80, 0x3c); // e_lfanew

// DOS stub: push cs / pop ds / mov dx, 0Eh / mov ah, 9 / int 21h / mov ax, 4C01h / int 21h
Buffer.from([0x0e, 0x1f, 0xba, 0x0e, 0x00, 0xb4, 0x09, 0xcd,
             0x21, 0xb8, 0x01, 0x4c, 0xcd, 0x21]).copy(image, 0x40);
Buffer.from("This dev cannot be run in cheat mode.\r\r\n$", "latin1").copy(image, 0x4e);

const hex = (n, width) => n.toString(16).toUpperCase().padStart(width, "0");
const printable = b => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".");

const rows = [];
for (let off = 0; off < image.length; off += 16) {
  if (off === 0x20) {
    rows.push({ gap: true });
    continue;
  }
  if (off === 0x30) continue;
  const bytes = [...image.subarray(off, off + 16)];
  rows.push({
    offset: hex(off, 8),
    bytes: bytes.map(b => hex(b, 2)),
    ascii: bytes.map(printable).join(""),
    // rows that carry the patched stub message get the accent treatment
    hot: off >= 0x40
  });
}

module.exports = { rows };
