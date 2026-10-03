package api

import (
	"fmt"
	"net"
	"net/netip"
	"net/url"
	"strings"
)

type ipAddressSpace int

const (
	addressSpaceLoopback ipAddressSpace = iota
	addressSpaceLocal
	addressSpacePublic
)

func (s ipAddressSpace) String() string {
	switch s {
	case addressSpaceLoopback:
		return "loopback"
	case addressSpaceLocal:
		return "local network"
	default:
		return "public"
	}
}

var localAddressBlocks = []netip.Prefix{
	netip.MustParsePrefix("10.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("172.16.0.0/12"),
	netip.MustParsePrefix("192.168.0.0/16"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("169.254.0.0/16"),
	netip.MustParsePrefix("fc00::/7"),
	netip.MustParsePrefix("fe80::/10"),
}

func addressSpaceForIP(addr netip.Addr) ipAddressSpace {
	addr = addr.Unmap()
	if addr.IsLoopback() || addr.IsUnspecified() {
		return addressSpaceLoopback
	}
	for _, block := range localAddressBlocks {
		if block.Contains(addr) {
			return addressSpaceLocal
		}
	}
	return addressSpacePublic
}

func addressSpaceForHostname(hostname string) (ipAddressSpace, bool) {
	host := strings.ToLower(strings.TrimSuffix(strings.Trim(hostname, "[]"), "."))
	if host == "" {
		return addressSpacePublic, false
	}
	if addr, err := netip.ParseAddr(host); err == nil {
		return addressSpaceForIP(addr), true
	}
	if isLocalhostName(host) {
		return addressSpaceLoopback, true
	}
	if host == "local" || strings.HasSuffix(host, ".local") {
		return addressSpaceLocal, true
	}
	return addressSpacePublic, false
}

func isLocalhostName(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	return host == "localhost" || strings.HasSuffix(host, ".localhost")
}

func isPotentiallyTrustworthyURL(u *url.URL) bool {
	if u == nil {
		return false
	}
	switch strings.ToLower(u.Scheme) {
	case "https", "wss":
		return true
	}
	space, known := addressSpaceForHostname(u.Hostname())
	if !known || space != addressSpaceLoopback {
		return false
	}
	if addr, err := netip.ParseAddr(strings.Trim(u.Hostname(), "[]")); err == nil && addr.Unmap().IsUnspecified() {
		return false
	}
	return true
}

func isMixedContentExemptLocalTarget(u *url.URL) bool {
	host := strings.ToLower(strings.TrimSuffix(strings.Trim(u.Hostname(), "[]"), "."))
	if addr, err := netip.ParseAddr(host); err == nil {
		return addressSpaceForIP(addr) != addressSpacePublic
	}
	return host == "local" || strings.HasSuffix(host, ".local")
}

func browserMixedContent(target *url.URL, b browserSecurityContext) string {
	if !b.active || b.originURL == nil || target == nil || !strings.EqualFold(b.originURL.Scheme, "https") {
		return ""
	}
	scheme := strings.ToLower(target.Scheme)
	if scheme != "http" && scheme != "ws" {
		return ""
	}
	if isPotentiallyTrustworthyURL(target) || isMixedContentExemptLocalTarget(target) {
		return ""
	}
	insecure, secure := "resource", "https"
	if scheme == "ws" {
		insecure, secure = "WebSocket endpoint", "wss"
	}
	return fmt.Sprintf("Mixed Content: the page at %s is served over HTTPS but requested the insecure %s %s; browsers block this request. Use %s:// for the target", b.originURL.String(), insecure, urlOrigin(target), secure)
}

func (b browserSecurityContext) enforcesBrowserBlocking() bool {
	return b.corsRequested || b.enforceCSP
}

func blockedBrowserNetworkAccess(target *url.URL, b browserSecurityContext) string {
	if !b.enforcesBrowserBlocking() {
		return ""
	}
	return browserMixedContent(target, b)
}

func browserNetworkAccessWarnings(target *url.URL, remoteAddr string, proxied bool, b browserSecurityContext) []string {
	if !b.active || b.originURL == nil || target == nil {
		return nil
	}
	var warnings []string
	if !b.enforcesBrowserBlocking() {
		if msg := browserMixedContent(target, b); msg != "" {
			warnings = append(warnings, msg+". Relay sent it because no browser check is enforced.")
		}
	}
	if b.kind != browserKindFetch {
		return warnings
	}
	targetSpace, known := addressSpaceForHostname(target.Hostname())
	if !known && !proxied {
		if host, _, err := net.SplitHostPort(remoteAddr); err == nil {
			if addr, err := netip.ParseAddr(host); err == nil {
				targetSpace, known = addressSpaceForIP(addr), true
			}
		}
	}
	if !known {
		return warnings
	}
	originSpace, _ := addressSpaceForHostname(b.originURL.Hostname())
	if targetSpace >= originSpace {
		return warnings
	}
	where := fmt.Sprintf("%s (%s) to %s (%s)", b.originURL.String(), originSpace, urlOrigin(target), targetSpace)
	if isPotentiallyTrustworthyURL(b.originURL) {
		warnings = append(warnings, "Local Network Access: this is a request from "+where+". Chrome asks the user for permission to access devices on the local network first, and the request fails if they decline.")
	} else {
		warnings = append(warnings, "Local Network Access: this is a request from "+where+". The page is not a secure context, so Chrome will not let it reach the local network at all; serve the page over HTTPS.")
	}
	return warnings
}
