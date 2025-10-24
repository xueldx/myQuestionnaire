"use client";

import React from "react";
import { ShareIcon } from "@heroicons/react/24/solid";
import { Popover, PopoverContent, PopoverTrigger } from "@heroui/popover";
import { Snippet } from "@heroui/snippet";
import useNotyf from "@/hooks/useNotyf";

import { copyToClipboard } from "@/utils/copy";

const ShareButton = () => {
  const { showSuccess, showError } = useNotyf();
  const copyShareLink = async () => {
    try {
      await copyToClipboard(window.location.href);
      showSuccess("分享链接已复制到剪贴板");
    } catch (err) {
      showError("复制失败，请手动复制链接");
    }
  };
  return (
    <Popover placement="bottom">
      <PopoverTrigger>
        <ShareIcon className="text-default-500 size-6 cursor-pointer" />
      </PopoverTrigger>
      <PopoverContent>
        <Snippet color="secondary" variant="shadow" onCopy={copyShareLink}>
          点击复制分享链接🔗到剪贴板
        </Snippet>
      </PopoverContent>
    </Popover>
  );
};

export default ShareButton;
