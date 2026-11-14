# Homebrew cask for our own tap (github.com/OWNER/homebrew-calmmd → Casks/calmmd.rb).
# Install: brew install --cask OWNER/calmmd/calmmd
#
# The app isn't notarized (no paid Apple account yet), so the postflight clears the quarantine
# flag; people installing from this tap have chosen to trust it. Update version and sha256 per
# release (from the release's SHA256SUMS).
cask "calmmd" do
  version "0.1.0"
  sha256 "REPLACE_WITH_SHA256_FROM_SHA256SUMS"

  url "https://github.com/OWNER/calmmd/releases/download/v#{version}/CalmMD_#{version}_universal.dmg"
  name "CalmMD"
  desc "Markdown, calmly. A calm Markdown editor"
  homepage "https://github.com/OWNER/calmmd"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :big_sur"

  app "CalmMD.app"

  postflight do
    system_command "/usr/bin/xattr", args: ["-dr", "com.apple.quarantine", "#{appdir}/CalmMD.app"]
  end

  zap trash: [
    "~/Library/Application Support/app.calmmd.editor",
    "~/Library/Caches/app.calmmd.editor",
    "~/Library/WebKit/app.calmmd.editor",
  ]
end
