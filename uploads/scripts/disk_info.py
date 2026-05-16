#!/usr/bin/env python3
"""Disk information script"""
import shutil
import os

def get_disk_info(path="/"):
    total, used, free = shutil.disk_usage(path)
    print(f"Total: {total // (2**30)} GB")
    print(f"Used:  {used // (2**30)} GB")
    print(f"Free:  {free // (2**30)} GB")

if __name__ == "__main__":
    get_disk_info()
