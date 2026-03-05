variable "VERSION" {
  default = "dev"
}

group "default" {
  targets = ["server", "website", "archiver"]
}

target "server" {
  context = "."
  dockerfile = "Dockerfile"
  platforms = ["linux/amd64", "linux/arm64"]
  tags = ["aeolun/superchat:latest", "aeolun/superchat:${VERSION}"]
  args = {
    VERSION = "${VERSION}"
  }
}

target "website" {
  context = "."
  dockerfile = "website/Dockerfile"
  platforms = ["linux/amd64", "linux/arm64"]
  tags = ["aeolun/superchat-website:latest", "aeolun/superchat-website:${VERSION}"]
}

target "archiver" {
  context = "."
  dockerfile = "Dockerfile.archiver"
  platforms = ["linux/amd64", "linux/arm64"]
  tags = ["aeolun/superchat-archiver:latest", "aeolun/superchat-archiver:${VERSION}"]
  args = {
    VERSION = "${VERSION}"
  }
}
