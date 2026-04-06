"""
擬似ttyヘルパー: node-pty利用不可時の代替PTYドライバ
stdinからの入力をptyに転送し、ptyの出力をstdoutに転送する。
リサイズはstdinの特殊エスケープシーケンス \\x1b[R;<cols>;<rows>\\x07 で処理。
"""
import pty
import os
import sys
import select
import struct
import fcntl
import termios
import signal

RESIZE_PREFIX = b'\x1b[R;'
RESIZE_SUFFIX = b'\x07'

def set_pty_size(fd, cols, rows):
    """ptyのウィンドウサイズを設定"""
    winsize = struct.pack('HHHH', rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)

def main():
    if len(sys.argv) < 2:
        print("使用法: pty-helper.py <command> [args...]", file=sys.stderr)
        sys.exit(1)

    cmd = sys.argv[1:]
    cwd = os.environ.get('PTY_CWD', os.getcwd())
    cols = int(os.environ.get('PTY_COLS', '120'))
    rows = int(os.environ.get('PTY_ROWS', '30'))

    # ptyペア作成
    master_fd, slave_fd = pty.openpty()

    # 初期サイズ設定
    set_pty_size(master_fd, cols, rows)

    pid = os.fork()
    if pid == 0:
        # 子プロセス: 新セッション + slave ptyに接続
        os.setsid()
        os.dup2(slave_fd, 0)
        os.dup2(slave_fd, 1)
        os.dup2(slave_fd, 2)
        os.close(master_fd)
        os.close(slave_fd)
        os.chdir(cwd)
        os.execvp(cmd[0], cmd)
    else:
        # 親プロセス: stdin→master, master→stdout の転送
        os.close(slave_fd)
        stdin_fd = sys.stdin.fileno()
        stdout_fd = sys.stdout.fileno()

        # stdinをノンブロッキングに
        import fcntl as _fcntl
        flags = _fcntl.fcntl(stdin_fd, _fcntl.F_GETFL)
        _fcntl.fcntl(stdin_fd, _fcntl.F_SETFL, flags | os.O_NONBLOCK)

        buf = b''
        try:
            while True:
                try:
                    fds, _, _ = select.select([stdin_fd, master_fd], [], [], 0.1)
                except (select.error, ValueError):
                    break

                if stdin_fd in fds:
                    try:
                        data = os.read(stdin_fd, 65536)
                    except OSError:
                        break
                    if not data:
                        break

                    # リサイズコマンドを検出・処理
                    buf += data
                    while RESIZE_PREFIX in buf:
                        idx = buf.index(RESIZE_PREFIX)
                        # プレフィックス前のデータをptyに送信
                        if idx > 0:
                            os.write(master_fd, buf[:idx])
                        buf = buf[idx + len(RESIZE_PREFIX):]
                        # サフィックスを探す
                        end_idx = buf.find(RESIZE_SUFFIX)
                        if end_idx == -1:
                            buf = RESIZE_PREFIX + buf  # 不完全、元に戻す
                            break
                        params = buf[:end_idx].decode('ascii', errors='ignore')
                        buf = buf[end_idx + len(RESIZE_SUFFIX):]
                        try:
                            c, r = params.split(';')
                            set_pty_size(master_fd, int(c), int(r))
                            # SIGWINCHを子プロセスに送信
                            os.kill(pid, signal.SIGWINCH)
                        except (ValueError, OSError) as e:
                            print(f"リサイズ処理エラー: {e}", file=sys.stderr)
                    # 残りのデータをptyに送信
                    if buf and RESIZE_PREFIX not in buf:
                        os.write(master_fd, buf)
                        buf = b''

                if master_fd in fds:
                    try:
                        data = os.read(master_fd, 65536)
                    except OSError:
                        break
                    if not data:
                        break
                    os.write(stdout_fd, data)

                # 子プロセスの終了チェック
                result = os.waitpid(pid, os.WNOHANG)
                if result[0] != 0:
                    # 残りの出力をフラッシュ
                    try:
                        while True:
                            data = os.read(master_fd, 65536)
                            if not data:
                                break
                            os.write(stdout_fd, data)
                    except OSError:
                        pass
                    sys.exit(os.WEXITSTATUS(result[1]) if os.WIFEXITED(result[1]) else 1)

        except KeyboardInterrupt:
            pass
        finally:
            os.close(master_fd)
            try:
                os.kill(pid, signal.SIGTERM)
                os.waitpid(pid, 0)
            except (OSError, ChildProcessError):
                pass

if __name__ == '__main__':
    main()
