#!/usr/bin/env python3
# 起跳音「真实蹬地」素材的裁剪 / 适配脚本（raw/env/jump.mp3 → env/jump.m4a）。
#
# 沿革（env/jump.m4a 三版）：
#   v1  Wikimedia「Boing raw」(cfork, CC-BY)：3.6s 卡通弹簧，太长太诙谐 → 弃。
#   v2  gen_jump.py 程序合成 0.30s 正弦「hop」(心屿原创 CC0)：轻盈但音色偏电子，
#       配真实 3D 角色起跳显违和（玩家反馈「声音和跳起来不匹配」）→ 降为断网降级。
#   v3  本脚本：采用 Gravity Sound《Jump》(Wikimedia Commons, CC-BY 4.0)——与项目既有
#       footstep/collect/whoosh/wind_forest 同一作者、音色体系统一的真实蹬地冲击音。
#       原素材 1.0s 且前导 ~0.18s 静音；本脚本裁出核心冲击段（≈0.34s）、去前导静音
#       （消除「按键→出声」的延迟感）、首尾淡入淡出防爆音、峰值归一。
#
# 用法：python3 proc_jump.py   → 读 raw/env/jump.mp3，写 env/jump.m4a。
# 依赖：afconvert（macOS 自带，mp3↔wav↔m4a）。
# 注：sfx.ts 的 playJump() 仍保留一版合成轻 hop 作断网降级（配方见 gen_jump.py）。

import array
import os
import subprocess
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
_RAW_ENV = os.path.join(HERE, "..", "..", "_audio_raw", "env")  # raw 已移出 public
SRC_MP3 = os.path.join(_RAW_ENV, "jump.mp3")
TMP_WAV = os.path.join(_RAW_ENV, "_jump_src.wav")
CUT_WAV = os.path.join(_RAW_ENV, "_jump_cut.wav")
OUT_M4A = os.path.join(HERE, "env", "jump.m4a")


def run(*a):
    subprocess.run(a, check=True, capture_output=True)


def main():
    # 1) mp3 → wav（afconvert 解码为 16-bit LE）
    run("afconvert", "-f", "WAVE", "-d", "LEI16", SRC_MP3, TMP_WAV)
    w = wave.open(TMP_WAV, "rb")
    sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
    a = array.array("h")
    a.frombytes(w.readframes(n))
    w.close()
    mono = [(a[i] + a[i + 1]) / 2.0 for i in range(0, len(a), 2)] if ch == 2 else [float(x) for x in a]
    N = len(mono)
    # 2) 5ms 窗 RMS 包络，定位起音与衰减
    win = int(sr * 0.005)
    env = [(i, (sum(x * x for x in mono[i:i + win]) / win) ** 0.5) for i in range(0, N - win, win)]
    peak = max(e for _, e in env) or 1.0
    onset = next((i for i, e in env if e / peak > 0.03), 0)
    start = max(0, onset - int(sr * 0.008))               # 起音前留 8ms 起手
    peakpos = max(env, key=lambda x: x[1])[0]
    endw = next((i for i, e in env if i > peakpos and e / peak < 0.04), N - win)
    end = min(N, endw + int(sr * 0.03))                   # 衰减后留 30ms 尾
    seg = mono[start:end]
    # 3) 首尾淡入淡出（防截断爆音）
    fi, fo = int(sr * 0.004), min(int(sr * 0.06), len(seg) // 4)
    for k in range(fi):
        seg[k] *= k / fi
    for k in range(fo):
        seg[len(seg) - 1 - k] *= k / fo
    # 4) 峰值归一到 0.85（运行时再乘 gain0.5·envGain0.7）
    g = 0.85 * 32767 / (max(abs(x) for x in seg) or 1.0)
    out = array.array("h", (max(-32768, min(32767, int(x * g))) for x in seg))
    ow = wave.open(CUT_WAV, "wb")
    ow.setnchannels(1)
    ow.setsampwidth(2)
    ow.setframerate(sr)
    ow.writeframes(out.tobytes())
    ow.close()
    # 5) wav → m4a（AAC 128k）
    run("afconvert", "-f", "m4af", "-d", "aac", "-b", "128000", CUT_WAV, OUT_M4A)
    for t in (TMP_WAV, CUT_WAV):
        try:
            os.remove(t)
        except OSError:
            pass
    print("wrote %s  (%.3fs mono %dHz, from %d-sample source)" % (OUT_M4A, len(seg) / sr, sr, N))


if __name__ == "__main__":
    main()
