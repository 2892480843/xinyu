#!/usr/bin/env python3
# 起跳音「轻上扬 hop」程序化合成器（原创·CC0·零素材）。
#
# 现状（2026-06）：正式采样 env/jump.m4a 已改用 Gravity Sound《Jump》真实蹬地音
# (CC-BY 4.0，裁剪见 proc_jump.py)。本脚本不再生成正式采样，转为 sfx.ts 合成降级
# playJump() 的「配方文档」——采样未命中（首访 / 断网）时回退的那一缕轻 hop。
#
# 背景：env/jump.m4a 初版为 Wikimedia「Boing raw」(cfork, CC-BY)，3.6s 卡通弹簧
# 「boing」——比整段滞空(≈2·JUMP_V/GRAVITY≈0.65s)还长 5 倍，诙谐音色与静谧海岛基调
# 不搭，遂以本脚本的 ~0.3s 柔和上扬「hop」替换；后因合成音色偏电子、配真实 3D 角色
# 起跳仍显违和（「不匹配」），正式采样再换为上述真实蹬地音，本合成版降为断网兜底。
# 信号：正弦扫频上行(八度)主体 + 低八度托底 + 一缕空气噪声 + 微光高频，与 sfx.ts 调色板一致。
#
# 用法：python3 gen_jump.py   → 写出 raw/env/jump.wav（仅供试听 / 留档，非正式采样源）。
# 与 sfx.ts 的合成降级 playJump() 同一配方。

import math
import os
import struct
import wave

SR = 48000          # 采样率，与其余 env 采样对齐
DUR = 0.30          # 总时长（秒）——起跳点缀，远短于 3.6s 的旧 boing
N = int(SR * DUR)
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_WAV = os.path.join(HERE, "raw", "env", "jump.wav")


def glide(t, f0, f1, tau):
    """频率从 f0 指数趋近 f1（快起慢稳的上扬手感）。"""
    return f1 + (f0 - f1) * math.exp(-t / tau)


def env_ad(t, attack, tau):
    """attack 线性起音 + 指数衰减包络。"""
    if t < attack:
        return t / attack
    return math.exp(-(t - attack) / tau)


def synth():
    buf = [0.0] * N
    # 各层独立累积相位（扫频下不能用 sin(2πf t)，须对瞬时频率积分）
    ph_body = ph_sub = ph_shim = 0.0
    lp = 0.0  # 空气噪声的一极点低通状态
    # 确定性噪声（不依赖随机库，结果可复现）：简单 LCG
    seed = 0x2545F491
    for i in range(N):
        t = i / SR
        # 1) 主体：380→760Hz 正弦上扬（八度）
        f_body = glide(t, 380.0, 760.0, 0.045)
        ph_body += 2 * math.pi * f_body / SR
        body = math.sin(ph_body) * env_ad(t, 0.005, 0.075) * 0.90
        # 2) 低八度托底：190→380Hz，给一点身体感与暖度
        f_sub = glide(t, 190.0, 380.0, 0.050)
        ph_sub += 2 * math.pi * f_sub / SR
        sub = math.sin(ph_sub) * env_ad(t, 0.006, 0.090) * 0.40
        # 3) 空气掠过：白噪声经一极点低通，短促衰减
        seed = (1103515245 * seed + 12345) & 0x7FFFFFFF
        white = (seed / 0x3FFFFFFF) - 1.0
        lp += 0.22 * (white - lp)
        air = lp * env_ad(t, 0.003, 0.040) * 0.18
        # 4) 微光高频：1500→1950Hz，极短，添轻盈空气感
        f_shim = glide(t, 1500.0, 1950.0, 0.030)
        ph_shim += 2 * math.pi * f_shim / SR
        shim = math.sin(ph_shim) * env_ad(t, 0.003, 0.030) * 0.12
        buf[i] = body + sub + air + shim

    # 尾部 6ms 线性淡出，消除截断爆音
    fade = int(SR * 0.006)
    for k in range(fade):
        buf[N - 1 - k] *= k / fade

    # 归一化峰值到 0.62（留余量；运行时再乘 gain0.5·envGain0.7）
    peak = max(1e-9, max(abs(x) for x in buf))
    scale = 0.62 / peak
    return [x * scale for x in buf]


def main():
    os.makedirs(os.path.dirname(OUT_WAV), exist_ok=True)
    samples = synth()
    with wave.open(OUT_WAV, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)  # 16-bit
        w.setframerate(SR)
        frames = b"".join(
            struct.pack("<h", max(-32768, min(32767, int(x * 32767)))) for x in samples
        )
        w.writeframes(frames)
    print("wrote %s  (%d samples, %.3fs, %d Hz mono)" % (OUT_WAV, len(samples), DUR, SR))


if __name__ == "__main__":
    main()
