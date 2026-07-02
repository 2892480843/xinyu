import { useState } from "react";
import { motion } from "framer-motion";
import type { LocalIdentity } from "../lib/localIdentity";
import { createIdentity, DEFAULT_NICKNAME } from "../lib/localIdentity";
import { seedIdentity } from "../lib/api";
import { SPRING_TAP } from "../lib/motion";

interface Props {
  onReady: (identity: LocalIdentity) => void;
}

export default function IdentityGate({ onReady }: Props) {
  const [nickname, setNickname] = useState("");

  const submit = () => {
    const identity = createIdentity(nickname);
    // 新身份首访时为其注入种子记忆，让岛屿一开始就「记得你」（后端幂等）
    seedIdentity(identity.user_id);
    onReady(identity);
  };

  return (
    <motion.div
      className="panel-glass-2 relative z-30 mx-auto w-full max-w-md rounded-card-lg p-6"
      initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <h2 className="font-serif text-mist-100 text-title-sm">先给岛屿一个称呼</h2>
      <p className="mt-2 text-mist-400 text-body leading-relaxed">
        可以直接进入；留空会使用「{DEFAULT_NICKNAME}」。称呼只保存在本机浏览器，用来区分你的本地记忆。
      </p>
      <input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        maxLength={24}
        placeholder={`留空默认：${DEFAULT_NICKNAME}`}
        className="mt-5 w-full rounded-card bg-ink-900/35 border border-mist-600 px-4 py-3 text-mist-100 placeholder:text-mist-500 text-base font-serif outline-none focus:border-mist-400 transition-colors"
      />
      <motion.button
        type="button"
        onClick={submit}
        whileHover={{ y: -1, scale: 1.01 }}
        whileTap={{ scale: 0.97 }}
        transition={SPRING_TAP}
        className="btn-primary mt-4 w-full"
      >
        进入心屿
      </motion.button>
      <p className="mt-3 text-caption text-mist-500 leading-relaxed">
        不需要密码；请不要填写手机号、邮箱、学号等真实身份信息。
      </p>
    </motion.div>
  );
}
