package fun.warnetwork.accountlink;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class ApiJson {
    private ApiJson() { }

    static String quote(String value) {
        if (value == null) return "null";
        StringBuilder out = new StringBuilder(value.length() + 2).append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> { if (c < 0x20) out.append(String.format("\\u%04x", (int) c)); else out.append(c); }
            }
        }
        return out.append('"').toString();
    }

    static String stringField(String json, String name) {
        Pattern pattern = Pattern.compile("\\\"" + Pattern.quote(name) + "\\\"\\s*:\\s*\\\"((?:\\\\.|[^\\\"\\\\])*)\\\"");
        Matcher matcher = pattern.matcher(json);
        if (!matcher.find()) return "";
        String raw = matcher.group(1);
        StringBuilder decoded = new StringBuilder(raw.length());
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c != '\\' || i + 1 >= raw.length()) { decoded.append(c); continue; }
            char escaped = raw.charAt(++i);
            switch (escaped) {
                case '"', '\\', '/' -> decoded.append(escaped);
                case 'n' -> decoded.append('\n');
                case 'r' -> decoded.append('\r');
                case 't' -> decoded.append('\t');
                case 'b' -> decoded.append('\b');
                case 'f' -> decoded.append('\f');
                case 'u' -> { if (i + 4 < raw.length()) { decoded.append((char) Integer.parseInt(raw.substring(i + 1, i + 5), 16)); i += 4; } }
                default -> decoded.append(escaped);
            }
        }
        return decoded.toString();
    }

    static boolean trueField(String json, String name) {
        return Pattern.compile("\\\"" + Pattern.quote(name) + "\\\"\\s*:\\s*true").matcher(json).find();
    }
}
