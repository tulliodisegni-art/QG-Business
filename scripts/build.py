"""Construit le site installable dans _site/ à partir de src/qg-business.html et web/."""
import pathlib, shutil

root = pathlib.Path(__file__).resolve().parent.parent
out = root / "_site"
shutil.rmtree(out, ignore_errors=True)
shutil.copytree(root / "web", out)

page = (root / "src" / "qg-business.html").read_text(encoding="utf-8")
head = (
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    '<link rel="manifest" href="manifest.webmanifest">'
    '<link rel="icon" href="icons/icon-192.png">'
    '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">'
    '<meta name="theme-color" content="#F6F1E7">'
    '<meta name="apple-mobile-web-app-capable" content="yes">'
    '<meta name="mobile-web-app-capable" content="yes">'
    '<meta name="apple-mobile-web-app-title" content="QG Business">'
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">'
    '<style>:root{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
    'body{margin:0;padding:0}img{max-width:100%}[hidden]{display:none!important}</style>'
    '<script src="shim.js"></script>'
    '</head><body>'
)
(out / "index.html").write_text(head + page + "</body></html>", encoding="utf-8")
print("ok", out / "index.html")
