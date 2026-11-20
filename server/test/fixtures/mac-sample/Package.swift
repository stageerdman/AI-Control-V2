// swift-tools-version:5.9
// A tiny SwiftUI package: the agent-shell check builds and tests it (test/runtime/mac-build.live.test.ts).
import PackageDescription

let package = Package(
    name: "Greeter",
    platforms: [.macOS(.v13)],
    products: [.library(name: "Greeter", targets: ["Greeter"])],
    targets: [
        .target(name: "Greeter"),
        .testTarget(name: "GreeterTests", dependencies: ["Greeter"]),
    ]
)
