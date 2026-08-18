#!/bin/sh
# Media.io CLI installer.
#
# Installs `mediaio` (primary) + `media-io` symlink (always).
# Tries to install the `mi` shortcut unless that command already belongs to
# another product.
#
# 默认走「用户可写、免 sudo」目录（Homebrew → 可写的 /usr/local → ~/.local），
# 安装目录不在 PATH 时自动写入对应 shell 启动文件；显式 --prefix 时尊重用户选择并保留 sudo 回退。
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
PREFIX_EXPLICIT=no
TAG=""
INSTALL_MI=auto

while [ "$#" -gt 0 ]; do
  case "$1" in
    --prefix=*) PREFIX="${1#*=}"; PREFIX_EXPLICIT=yes; shift ;;
    --prefix)   PREFIX="$2"; PREFIX_EXPLICIT=yes; shift 2 ;;
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
  # 通过 /releases/latest 的 302 重定向拿版本号，避开 api.github.com 未鉴权限流（60 次/小时/IP）
  EFFECTIVE_URL="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" 2>/dev/null || true)"
  case "$EFFECTIVE_URL" in
    */releases/tag/*) TAG="${EFFECTIVE_URL##*/releases/tag/}" ;;
    *) TAG="" ;;
  esac
  if [ -z "$TAG" ]; then
    echo "Failed to determine latest release. Pass --tag <version> explicitly." >&2
    exit 1
  fi
fi
VER_NO_V="${TAG#v}"
TARBALL="mediaio_${VER_NO_V}_${OS}_${ARCH}.tar.gz"
URL="https://github.com/$REPO/releases/download/$TAG/$TARBALL"
echo "Downloading $URL"
curl -fsSL -o "$TMPDIR/$TARBALL" "$URL"

# 下载路径已知，直接使用，避免解析 ls 输出
ARCHIVE="$TMPDIR/$TARBALL"
if [ ! -s "$ARCHIVE" ]; then
  echo "Download failed or empty archive: $URL" >&2
  exit 1
fi
tar -xzf "$ARCHIVE" -C "$TMPDIR"

# 选择安装目录：未显式 --prefix 时优先挑一个当前用户可写、无需 sudo 的目录
select_bin_dir() {
  # 显式 --prefix：直接采用该目录，可写则免 sudo，不可写回退 sudo
  if [ "$PREFIX_EXPLICIT" = "yes" ]; then
    BIN_DIR="$PREFIX/bin"
    return
  fi
  # 1) 有 Homebrew 且其 bin 可写：装到 brew 目录，已在 PATH、免 sudo、免配 PATH
  if command -v brew >/dev/null 2>&1; then
    brew_bin="$(brew --prefix 2>/dev/null)/bin"
    if [ -n "$brew_bin" ] && [ -d "$brew_bin" ] && [ -w "$brew_bin" ]; then
      PREFIX="$(brew --prefix)"; BIN_DIR="$brew_bin"; return
    fi
  fi
  # 2) /usr/local/bin 当前用户可写（免 sudo）
  if [ -w "/usr/local/bin" ]; then
    PREFIX="/usr/local"; BIN_DIR="/usr/local/bin"; return
  fi
  # 3) 回退到用户目录：永远可写、免 sudo（可能需要配 PATH，稍后自动处理）
  PREFIX="$HOME/.local"; BIN_DIR="$HOME/.local/bin"
}
select_bin_dir

# 仅在交互式终端（有 tty）时才用 sudo；非交互（curl|sh 的 agent/CI 场景）下不挂起，给出指引后退出
sudo_or_fail() {
  if [ -t 1 ] || [ -t 0 ]; then
    sudo "$@"
  else
    echo "Error: '$BIN_DIR' is not writable and this is a non-interactive shell, so sudo cannot prompt for a password." >&2
    echo "Re-run with a user-writable prefix, e.g.:" >&2
    echo "  curl -fsSL https://raw.githubusercontent.com/$REPO/main/install.sh | sh -s -- --prefix=\"\$HOME/.local\"" >&2
    exit 1
  fi
}

if [ ! -d "$BIN_DIR" ]; then
  mkdir -p "$BIN_DIR" 2>/dev/null || sudo_or_fail mkdir -p "$BIN_DIR"
fi

run() {
  if [ -w "$BIN_DIR" ]; then "$@"; else sudo_or_fail "$@"; fi
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

# 安装目录不在 PATH 时，把 export 写进对应 shell 启动文件（幂等），并提示如何立即生效
ensure_on_path() {
  dir="$1"
  case ":$PATH:" in
    *":$dir:"*) return 0 ;;
  esac
  line="export PATH=\"$dir:\$PATH\""
  case "$SHELL" in
    */zsh)  profiles="$HOME/.zshrc" ;;
    */bash) profiles="$HOME/.bashrc $HOME/.bash_profile" ;;
    *)      profiles="$HOME/.profile" ;;
  esac
  written=""
  for p in $profiles; do
    if [ -f "$p" ] && grep -qsF "$line" "$p"; then
      written="$p"; continue
    fi
    printf '\n# Added by Media.io CLI installer\n%s\n' "$line" >> "$p" 2>/dev/null && written="$p" || true
  done
  if [ -n "$written" ]; then
    echo ""
    echo "PATH updated in: $written"
    echo "Run this now, or open a new terminal:"
    echo "  export PATH=\"$dir:\$PATH\""
  fi
}

echo "Installed: $($BIN_DIR/mediaio version)"
if [ "$MI_INSTALLED" = "yes" ]; then
  echo "Bins: mediaio, media-io, mi"
else
  echo "Bins: mediaio, media-io"
fi

ensure_on_path "$BIN_DIR"
