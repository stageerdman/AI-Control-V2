import SwiftUI

public func greeting(for name: String) -> String {
    let trimmed = name.trimmingCharacters(in: .whitespaces)
    return trimmed.isEmpty ? "Hello!" : "Hello, \(trimmed)!"
}

public struct GreetingView: View {
    let name: String

    public init(name: String) {
        self.name = name
    }

    public var body: some View {
        Text(greeting(for: name)).padding()
    }
}
