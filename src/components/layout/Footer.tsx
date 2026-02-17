import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="border-t border-border py-16">
      <div className="container px-4">
        <div className="grid md:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">SS</span>
              </div>
              <span className="font-display font-bold text-lg text-foreground">SuperService</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The universal marketplace for all services. Connect, book, and get things done.
            </p>
          </div>
          <div>
            <h4 className="font-display font-semibold text-foreground mb-4">Platform</h4>
            <div className="space-y-2">
              <Link to="/" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Browse Services</Link>
              <Link to="/register?role=provider" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Become a Provider</Link>
              <Link to="/" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Enterprise</Link>
            </div>
          </div>
          <div>
            <h4 className="font-display font-semibold text-foreground mb-4">Company</h4>
            <div className="space-y-2">
              <Link to="/about" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">About</Link>
              <Link to="/" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Careers</Link>
              <Link to="/" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Blog</Link>
            </div>
          </div>
          <div>
            <h4 className="font-display font-semibold text-foreground mb-4">Support</h4>
            <div className="space-y-2">
              <Link to="/" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Help Center</Link>
              <Link to="/" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Trust & Safety</Link>
              <Link to="/" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-border mt-12 pt-8 text-center text-sm text-muted-foreground">
          © 2026 SuperService. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
