import Foundation

// MARK: - Global Constants

private let translationCache = NSCache<NSString, NSString>()
private let localizationQueue = DispatchQueue(label: "com.artknowledgegraph.localization", attributes: .concurrent)

// MARK: - String Extension

extension String {
    
    /// A thread-safe computed property that returns the localized version of the string
    /// using the main bundle's Localizable.strings file.
    public var localized: String {
        let key = self as NSString
        
        // Check cache first
        if let cachedTranslation = localizationQueue.sync(execute: {
            translationCache.object(forKey: key)
        }) {
            return cachedTranslation as String
        }
        
        // Get localized string from bundle
        let localizedString = NSLocalizedString(self, tableName: "Localizable", bundle: .main, value: self, comment: "")
        
        // Cache the result
        localizationQueue.async(flags: .barrier) {
            translationCache.setObject(localizedString as NSString, forKey: key)
        }
        
        return localizedString
    }
    
    /// Returns a thread-safe localized string with format specifiers replaced by given arguments.
    /// - Parameter arguments: Variable number of arguments to replace format specifiers
    /// - Returns: Localized and formatted string with replaced arguments
    /// - Throws: Precondition failure if format specifiers don't match argument count
    public func localizedWithFormat(_ arguments: CVarArg...) -> String {
        let key = self as NSString
        let cacheKey = NSString(format: "%@_%@", key, arguments.description as NSString)
        
        // Check cache first
        if let cachedTranslation = localizationQueue.sync(execute: {
            translationCache.object(forKey: cacheKey)
        }) {
            return cachedTranslation as String
        }
        
        // Get base localized string
        let baseString = NSLocalizedString(self, tableName: "Localizable", bundle: .main, value: self, comment: "")
        
        // Validate format specifiers match argument count
        let formatCount = baseString.components(separatedBy: "%").count - 1
        precondition(formatCount == arguments.count, "Number of format specifiers (\(formatCount)) doesn't match number of arguments (\(arguments.count))")
        
        // Format string with arguments
        let formattedString = String(format: baseString, arguments: arguments)
        
        // Cache the result
        localizationQueue.async(flags: .barrier) {
            translationCache.setObject(formattedString as NSString, forKey: cacheKey)
        }
        
        return formattedString
    }
    
    /// Returns a thread-safe localized string with named argument replacements.
    /// - Parameter arguments: Dictionary of named arguments and their replacement values
    /// - Returns: Localized string with replaced named arguments
    /// - Throws: Precondition failure if named placeholders are missing corresponding arguments
    public func localizedWithArguments(_ arguments: [String: String]) -> String {
        let key = self as NSString
        let cacheKey = NSString(format: "%@_%@", key, arguments.description as NSString)
        
        // Check cache first
        if let cachedTranslation = localizationQueue.sync(execute: {
            translationCache.object(forKey: cacheKey)
        }) {
            return cachedTranslation as String
        }
        
        // Get base localized string
        var resultString = NSLocalizedString(self, tableName: "Localizable", bundle: .main, value: self, comment: "")
        
        // Find all placeholders in format ${key}
        let placeholderPattern = "\\$\\{(\\w+)\\}"
        let regex = try! NSRegularExpression(pattern: placeholderPattern, options: [])
        let matches = regex.matches(in: resultString, options: [], range: NSRange(resultString.startIndex..., in: resultString))
        
        // Validate all placeholders have corresponding arguments
        for match in matches {
            let placeholder = (resultString as NSString).substring(with: match.range(at: 1))
            precondition(arguments[placeholder] != nil, "Missing argument for placeholder: ${\\(placeholder)}")
        }
        
        // Replace placeholders with arguments
        for (key, value) in arguments {
            resultString = resultString.replacingOccurrences(of: "${\\(key)}", with: value, options: .regularExpression)
        }
        
        // Cache the result
        localizationQueue.async(flags: .barrier) {
            translationCache.setObject(resultString as NSString, forKey: cacheKey)
        }
        
        return resultString
    }
    
    /// Clears the localization cache when memory warning is received
    public static func clearLocalizationCache() {
        localizationQueue.async(flags: .barrier) {
            translationCache.removeAllObjects()
            NotificationCenter.default.post(name: NSNotification.Name("LocalizationCacheCleared"), object: nil)
        }
    }
}