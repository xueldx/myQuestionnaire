import React from "react";
import { Navbar as NextUINavbar, NavbarContent, NavbarBrand, NavbarItem } from "@heroui/navbar";
import NextLink from "next/link";
import { ThemeSwitch } from "@/components/themeSwitch";
import { FormOutlined } from "@/components/icons";

export const Navbar = () => {
  return (
    <NextUINavbar maxWidth="xl" position="sticky" shouldHideOnScroll>
      <NavbarContent className="basis-1/5 sm:basis-full" justify="start">
        <NavbarBrand as="li" className="gap-3 max-w-fit">
          <NextLink className="flex justify-start items-center gap-2" href="/">
            <FormOutlined className="text-[#408D86] text-[20px]" />
            <p className="font-bold text-[#408D86]">问卷小筑</p>
          </NextLink>
        </NavbarBrand>
      </NavbarContent>
      <NavbarContent className="hidden sm:flex basis-1/5 sm:basis-full" justify="end">
        <NavbarItem className="hidden sm:flex gap-3">
          {/* <ShareButton /> */}
          <ThemeSwitch />
        </NavbarItem>
      </NavbarContent>
      <NavbarContent className="sm:hidden basis-1 pl-4" justify="end">
        {/* <ShareButton /> */}
        <ThemeSwitch />
      </NavbarContent>
    </NextUINavbar>
  );
};
