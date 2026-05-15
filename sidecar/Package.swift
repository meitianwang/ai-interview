// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Sidecar",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "SidecarApp", targets: ["SidecarApp"]),
        .library(name: "SidecarCore", targets: ["SidecarCore"]),
    ],
    targets: [
        .executableTarget(name: "SidecarApp", dependencies: ["SidecarCore"]),
        .target(name: "SidecarCore"),
        .testTarget(name: "SidecarCoreTests", dependencies: ["SidecarCore"]),
    ]
)
