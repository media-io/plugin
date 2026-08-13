#!/bin/sh
# Media.io CLI installer.
#
# Installs `mediaio` (primary) + `media-io` symlink (always).
# Tries to install the `mi` shortcut unless that command already belongs to
# another product.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/media-io/cli/main/install.sh | sh
#   curl -fsSL ... | sh -s -- --prefix=$HOME/.local
#   curl -fsSL ... | sh -s -- --tag v0.1.1
#   curl -fsSL ... | sh -s -- --no-mi            # skip mi shortcut
#   curl -fsSL ... | sh -s -- --mi               # force mi shortcut

set -e

REPO="media-io/cli"
PREFIX="/usr/local"
TAG=""
INSTALL_MI=auto

while [ "$#" -gt 0 ]; do
  case "$1" in
    --prefix=*) PREFIX="${1#*=}"; shift ;;
    --prefix)   PREFIX="$2"; shift 2 ;;
    --tag=*)    TAG="${1#*=}"; shift ;;
    --tag)      TAG="$2"; shift 2 ;;
    --no-mi)    INSTALL_MI=no; shift ;;
    --mi)       INSTALL_MI=yes; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64)  ARCH="amd64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;;
esac
case "$OS" in
  darwin|linux) ;;
  *) echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

if [ -z "$TAG" ]; then
  TAG="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)"
  if [ -z "$TAG" ]; then
    echo "Failed to determine latest release." >&2
    exit 1
  fi
fi
VER_NO_V="${TAG#v}"
TARBALL="mediaio_${VER_NO_V}_${OS}_${ARCH}.tar.gz"
URL="https://github.com/$REPO/releases/download/$TAG/$TARBALL"
echo "Downloading $URL"
curl -fsSL -o "$TMPDIR/$TARBALL" "$URL"

ARCHIVE="$(ls "$TMPDIR"/mediaio_*.tar.gz 2>/dev/null | head -n 1)"
if [ -z "$ARCHIVE" ]; then
  echo "No archive found." >&2
  exit 1
fi
tar -xzf "$ARCHIVE" -C "$TMPDIR"

BIN_DIR="$PREFIX/bin"
if [ ! -d "$BIN_DIR" ]; then
  mkdir -p "$BIN_DIR" 2>/dev/null || sudo mkdir -p "$BIN_DIR"
fi

run() {
  if [ -w "$BIN_DIR" ]; then "$@"; else sudo "$@"; fi
}

# Primary binary: mediaio
run install -m 0755 "$TMPDIR/mediaio" "$BIN_DIR/mediaio"
[ "$OS" = "darwin" ] && run xattr -d com.apple.quarantine "$BIN_DIR/mediaio" 2>/dev/null || true
cat > "$TMPDIR/mediaio.install.json" <<EOF
{
  "install_method": "curl",
  "prefix": "$PREFIX",
  "bin": "$BIN_DIR/mediaio",
  "version": "$VER_NO_V"
}
EOF
run install -m 0644 "$TMPDIR/mediaio.install.json" "$BIN_DIR/mediaio.install.json"

# Branded long-form alias (always)
run ln -sf "$BIN_DIR/mediaio" "$BIN_DIR/media-io"

# Short alias (optional and conflict-aware)
MI_INSTALLED=no
if [ "$INSTALL_MI" = "no" ]; then
  echo "Skipping 'mi' shortcut (--no-mi)."
elif [ "$INSTALL_MI" = "yes" ]; then
  run ln -sf "$BIN_DIR/mediaio" "$BIN_DIR/mi"
  MI_INSTALLED=yes
else
  if command -v mi >/dev/null 2>&1; then
    EXISTING="$(command -v mi)"
    if [ "$EXISTING" = "$BIN_DIR/mi" ]; then
      run ln -sf "$BIN_DIR/mediaio" "$BIN_DIR/mi"
      MI_INSTALLED=yes
    else
      echo "Skipping 'mi' shortcut: $EXISTING already in PATH."
      echo "Force with --mi if you want to override it."
    fi
  else
    run ln -sf "$BIN_DIR/mediaio" "$BIN_DIR/mi"
    MI_INSTALLED=yes
  fi
fi

echo "Installed: $($BIN_DIR/mediaio version)"
if [ "$MI_INSTALLED" = "yes" ]; then
  echo "Bins: mediaio, media-io, mi"
else
  echo "Bins: mediaio, media-io"
fi
