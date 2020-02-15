const debugMode = false;

const INLINE_STYLE = 0;
const DISPLAY_STYLE = 1;

function toMathML(s, isDisplayStyle) {
	s = s.replace(/\n/g, " ").replace(/\t/g, "  ");
	console.log(s);

	let tree = parse(s);
	doLayout(tree);
	let result = write(tree, isDisplayStyle);

	console.log(result);
	return result;
}

// Types of Nodes
const GRID = 0;
const GRIDROW = 1;
const CELL = 2;
const ROW = 3;
const CLUSTER = 4;
const BRACKETED = 5;
const IDENTIFIER = 6;
const OPERATOR = 7;
const TEXT = 8;
const NUMBER = 9;
const FRACTION = 10;
const SCRIPTED = 11;
const ROOT = 12;
// TODO: VINCULUM
// TODO: OVERBRACE
// TODO: UNDERBRACE

function parse(s) {
	let parseObject = {};
	parseObject.s = s;
	parseObject.i = 0;
	parseObject.expectTerm = true;
	parseObject.expectBracket = "";

	return parseGrid(parseObject);
}

function matchString(p, s)
{
	if (p.i + s.length > p.s.length) {
		return false;
	}

	if (s.length == 1) {
		if (p.s[p.i] === s) {
			++p.i;
			return true;
		}
		return false;
	}

	if (p.s.substring(p.i, p.i + s.length) === s) {
		p.i += s.length;
		return true;
	}
	return false;
}

const indent = "  "; // Two space indent

function pad(s, nesting) {
	if (debugMode) {
		return indent.repeat(nesting) + s + "\n";
	}
	return s;
}
 
function writeGrid(nesting)
{
	let result = "";

	result += pad("<mtable>", nesting);
	for (let gridrow of this.gridrows) {
		result += gridrow.write(nesting + 1);
	}
	result += pad("</mtable>", nesting);

	return result;
}

function parseGrid(p) {
	let result = {"type": GRID, "gridrows": [], "write": writeGrid,
			"children": function(){return this.gridrows} };

	while(p.i < p.s.length) {
		if (matchString(p, ';')) {
			;
			p.expectTerm = true;
		} else {
			let gridrow = parseGridRow(p);
			if (gridrow) {
				result.gridrows.push(gridrow);
			} else {
				break;
			}
		}
	}

	if (result.gridrows.length == 1 && result.gridrows[0].cells.length == 1) {
		return result.gridrows[0].cells[0].row;
	}
	return result;
}

function writeGridRow(nesting)
{
	let result = "";

	result += pad("<mtr>", nesting);
	for (let cell of this.cells) {
		result += cell.write(nesting + 1);
	}
	result += pad("</mtr>", nesting);

	return result;
}

function parseGridRow(p) {
	let result = {"type": GRIDROW, "cells": [], "write": writeGridRow,
			"children": function(){return this.cells} };

	while (p.i < p.s.length) {
		if (matchString(p, "  ")) {  // Two spaces
			while (p.s[p.i] == ' ') {
				++p.i;
			}
			p.expectTerm = true;
		} else {
			let cell = parseCell(p);
			if (cell) {
				result.cells.push(cell);
			} else {
				break;
			}
		}
	}

	if (result.cells.length == 1) {
		// Do nothing. Cells cannot be elided (unless the entire grid row is elided).
	}

	if (result.cells.length == 0) {
		return "";  // Elide the grid row.
	}
	return result;
}

function writeCell(nesting)
{
	let result = "";

	result += pad("<mtd>", nesting);
	result += this.row.write(nesting + 1);
	result += pad("</mtd>", nesting);

	return result;
}

function parseCell(p) {
	let result = {"type": CELL, "row": parseRow(p), "write": writeCell,
			"children": function(){return [this.row]} };

	if (!result.row) {
		return "";
	}

	return result;
}

function writeRow(nesting)
{
	let result = "";

	result += pad("<mrow>", nesting);
	for (let element of this.elements) {
		result += element.write(nesting + 1);
	}
	result += pad("</mrow>", nesting);

	return result;
}

function parseRow(p) {
	let result = {"type": ROW, "elements": [], "write": writeRow,
			"children": function(){return this.elements} };

	while (p.i < p.s.length) {
		if (p.s[p.i] == ' ' && (p.i + 1 == p.s.length || p.s[p.i + 1] != ' ')) {
			// Rows can contain single spaces, but not double spaces
			++p.i;
		} else {
			let cluster = parseCluster(p);
			if (cluster) {
				result.elements.push(cluster);
			} else {
				break;
			}
		}
	}

	if (result.elements.length == 0) {
		return "";
	}
	if (result.elements.length == 1) {
		return result.elements[0];
	}

	return result;
}

function parseCluster(p) {
	let result = {"type": CLUSTER, "elements": [], "write": writeRow,
		"children": function(){return this.elements} };

	while (p.i < p.s.length) {
		let expr;
		if (expr = parseBracketed(p)) {
			result.elements.push(expr);
			p.expectTerm = false;
		} else if (expr = parseNumber(p)) {
			result.elements.push(expr);
			p.expectTerm = false;
		} else if (expr = parseText(p)) {
			result.elements.push(expr);
			p.expectTerm = false;
		} else {
			if (p.expectTerm) {
				if (expr = parseIdentifier(p)) {
					result.elements.push(expr);
					p.expectTerm = false;
				} else if (expr = parseOperator(p)) {
					result.elements.push(expr);
					p.expectTerm = !isPostfix(expr.operator);
				} else if (expr = parseUnrecognized(p)) {
					result.elements.push(expr);
					p.expectTerm = (expr.type == OPERATOR && !isPostfix(expr.operator));
				} else {
					break;
				}
			} else {
				if (expr = parseOperator(p)) {
					result.elements.push(expr);
					p.expectTerm = !isPostfix(expr.operator);
				} else if (expr = parseIdentifier(p)) {
					result.elements.push(expr);
					p.expectTerm = false;
				} else if (expr = parseUnrecognized(p)) {
					result.elements.push(expr);
					p.expectTerm = (expr.type == OPERATOR && !isPostfix(expr.operator));
				} else {
					break;
				}
			}
		}
	}

	if (result.elements.length == 0) {
		return "";
	}
	if (result.elements.length == 1) {
		return result.elements[0];
	}

	return result;
}

function writeBracketed(nesting) {
	let result = "";

	result += pad("<mrow>", nesting);
	if (this.left) result += pad("<mo fence=true>" + this.left + "</mo>", nesting + 1);
	if (this.contents) result += this.contents.write(nesting + 1);
	if (this.right) result += pad("<mo fence=true>" + this.right + "</mo>", nesting + 1);
	result += pad("</mrow>", nesting);

	return result;
}

function parseBracketed(p) {
	let result = {"type": BRACKETED, "left": "", "right": "", "contents": null, "write" : writeBracketed,
			"children": function(){return [this.left, this.contents, this.right]} };

	let left = "";

	let oldExpectBracket = p.expectBracket;

	if (matchString(p, '(')) {
		p.expectBracket = ")";  // TODO: Allow half-open ranges like (3, 5]
		result.left = '(';
	} else if (matchString(p, '[')) {
		p.expectBracket = "]";
		result.left = '[';
	} else if (matchString(p, '{')) {
		p.expectBracket = "}";
		result.left = '{';
	} else if (matchString(p, '|_')) {
		p.expectBracket = "_|";
		result.left = "&lfloor;";
	} else if (p.expectTerm && matchString(p, '<<')) {
		p.expectBracket = ">>";
		result.left = "&lAng;";
	} else if (p.expectTerm && matchString(p, '<')) {
		p.expectBracket = ">";
		result.left = "&lang;";
	} else if (matchString(p, '||:')) {
		p.expectBracket = ":||";
		result.left = "&par;";
	} else if (matchString(p, '|:')) {
		p.expectBracket = ":|";
		result.left = "&mid;";
	}

	if (result.left) {
		p.expectTerm = true;

		let grid = parseGrid(p);
		if (grid) {
			result.contents = grid;
		}

		if (matchString(p, ')')) {
			result.right = ')';
		} else if (matchString(p, ']')) {
			result.right = ']';
		} else if (matchString(p, '}')) {
			result.right = '}';
		} else if (matchString(p, '_|')) {
			result.right = "&rfloor;";
		} else if (matchString(p, '>>')) {
			result.right = "&rAng;";
		} else if (matchString(p, '>')) {
			result.right = "&rang;";
		} else if (matchString(p, ':||')) {
			result.right = "&par;";
		} else if (matchString(p, ':|')) {
			result.right = "&mid;";
		}

		p.expectBracket = oldExpectBracket;
		p.expectTerm = false;
	}

	if (!result.left && !result.right && !result.contents) {
		return "";
	}
	if (!result.left && !result.right && result.contents) {
		return result.contents;
	}

	return result;
}

function writeNumber(nesting) {
	return pad("<mn>" + this.number + "</mn>", nesting);
}

function isDigit(c) {
	return c >= "0" && c <= "9";
}

function isNumericSeparator(c) {
	return c == "." || c == "," || c== " ";
}

function isNumeric(s, i) {
	return isDigit(s[i]) ||
		(i + 1 < s.length && isNumericSeparator(s[i]) && isDigit(s[i + 1]));
}

function parseNumber(p) {
	let result = {"type": NUMBER, "number": "", "write": writeNumber};

	if (p.i < p.s.length && isDigit(p.s[p.i])) {
		let end = p.i + 1;
		while (end < p.s.length && isNumeric(p.s, end)) {
			++end;
		}

		result.number = p.s.substring(p.i, end);
		p.i = end;

		return result;
	}

	return "";
}

function writeText(nesting)
{
	let text = this.text;
	text = text.replace(/\\u/g, "&micro;");
	return pad("<mtext>&thinsp;" + text + "&nbsp;</mtext>", nesting);
}

function parseText(p) {
	// Text appears in double-quotes. Like "this".

	// TODO: Allow escaped double-quote charactes in the text

	if (matchString(p, "\"")) {
		let result = {"type": TEXT, "text": "", "write" : writeText};

		while (p.i < p.s.length && !matchString(p, "\"")) {
			result.text += p.s[p.i];
			++p.i;
		}

		return result;
	}

	return "";
}

// Note: Because of how matching works, only two kinds of keys are allowed:
// * Those that start with a non-alphabetic character
// * Those that are entirely alphabetic.
const identifierDictionary = {
	// When a letter can be an operator, prefixing it with backslash makes it an identifier again.
	"\\X" : "X",
	"\\v" : "v",
	"\\V" : "V",
	"\\o" : "o",

	// HTML 4.0 entities
	"null" : "&empty;",
	"empty" : "&empty;",

	"inf" : "&infin;",

	"deg" : "&deg;",
	"degree" : "&deg;",
	"degrees" : "&deg;",
	"°" : "&deg;",   // Some European keyboards have this as a key

	"Im" : "&image;",
	"Re" : "&real;",

	"aleph": "&alefsym;",
	"Aleph": "&alefsym;",

	// Greek letters used as math symbols
	"Alpha" : "&Alpha;",
	"Beta" : "&Beta;",
	"Gamma" : "&Gamma;",
	"Delta" : "&Delta;",
	"Epsilon" : "&Epsilon;",
	"Zeta" : "&Zeta;",
	"Eta" : "&Eta;",
	"Theta" : "&Theta;",
	"Iota" : "&Iota;",
	"Kappa" : "&Kappa;",
	"Lambda" : "&Lambda;",
	"Mu" : "&Mu;",
	"Nu" : "&Nu;",
	"Xi" : "&Xi;",
	"Omicron" : "&Omicron;",
	"Pi" : "&Pi;",
	"Rho" : "&Rho;",
	"Sigma" : "&Sigma;",
	"Tau" : "&Tau;",
	"Upsilon" : "&Upsilon;",
	"Phi" : "&Phi;",
	"Chi" : "&Chi;",
	"Psi" : "&Psi;",
	"Omega" : "&Omega;",
	
	"alpha" : "&alpha;",
	"beta" : "&beta;",
	"gamma" : "&gamma;",
	"delta" : "&delta;",
	"epsilon" : "&epsilon;",
	"zeta" : "&zeta;",
	"eta" : "&eta;",
	"theta" : "&theta;",
	"iota" : "&iota;",
	"kappa" : "&kappa;",
	"lambda" : "&lambda;",
	"mu" : "&mu;",
	"nu" : "&nu;",
	"xi" : "&xi;",
	"omicron" : "&omicron;",
	"pi" : "&pi;",
	"rho" : "&rho;",
	"sigma" : "&sigma;",
	"tau" : "&tau;",
	"upsilon" : "&upsilon;",
	"phi" : "&phi;",
	"chi" : "&chi;",
	"psi" : "&psi;",
	"omega" : "&omega;",

	"\\theta" : "&thetasym;",
	"\\pi" : "&piv;",
	"\\sigma" : "&sigmaf;",
	"\\upsilon" : "&upsih;",

	"\\p" : "&weierp;",

	// Non HTML 4.0
	"\\phi": "&phiv;",
};

const maxIdentifierKeyLength = 8;  // Actually only matters for the keys that start with a non-letter.

// Note: Because of how matching works, only two kinds of keys are allowed:
// * Those that start with a non-alphabetic character
// * Those that are entirely alphabetic.
const operatorDictionary = {
	// Operators which need special handling
	"_" : "_",      // Suscripting
	"^" : "^",      // Superscripting. Can also represent &and;
	"/" : "/",      // Fractions
	"." : "&sdot;", // Invisible multiplication. Can also represent &sdot;
	"\\." : "&sdot;", // Invisible multiplication. Can also represent &sdot;
	"!" : "!",      // Factorial. Can also represent &not;
	":" : "&af;",   // An invisible operator. Can also represent spaced colon.
	".." : "..",    // Special syntax for ranges.

	// These operators are ASCII text strings. Are there any other ASCII words
	// that should be treated as operators?
	// TODO: Treat ASCII strings at operators if enclosed in a pair of colons. :operator:
	"lim" : "lim",
	"det" : "det",

	// These letter-like operators have special formatting
	"\\P" : "P",
	"\\C" : "C",
	"\\F" : "F",  // Hyper-geometric function

	"\\d" : "&dd;",  // Differential d

	// HTML 4.0 entities
	"X" : "&times;",  // cross-product
	"cross" : "&times;",  // cross-product

	"sqrt": "&radic;",
	"root": "&radic;",

	"not" : "&not;",
	"¬" : "&not;",  // British keyboards have this.

	"grad" : "&nabla;",
	"div" : "&nabla;&sdot;",
	"curl" : "&nabla;&times;",

	"in" : "&isin;",
	"!in" : "&notin;",
	"¬in" : "&notin;",

	"sum" : "&sum;",
	"Sum" : "&sum;",
	"prod" : "&prod;",
	"Prod" : "&prod;",

	"prop" : "&prop;",

	"and" : "&and;",
	"or" : "&or;",
	"v" : "&or;",
	"V" : "&or;",

	"cup" : "&cup;",
	"cap" : "&cap;",
	
	"ang" : "&ang;",

	"therefore" : "&there4;",

	"\\\'" : "&prime;",
	"\'" : "&prime;",
	"%" : "%",

	"..." : "&hellip;",
	"\\..." : "&hellip;",

	"\\A:" : "&forall;",
	"\\E:" : "&exist;",

	"\\:" : ":",   // Allow an escaped literal colon
	"\\;" : ";",   // Allow an escaped literal semicolon

	"-" : "&minus;",
	"+/-" : "&plusmn;",
	"*" : "&lowast;",

	"@" : "&part;",

	"\\v" : "&or;",

	"$" : "&int;",

	"=" : "=",
	"!=" : "=",
	"¬=" : "=",

	"==" : "=",
	"!==" : "&ne;",
	"¬==" : "&ne;",

	"===" : "&equiv;",
	
	"~" : "&sim;",
	"~~" : "&asymp;",
	"~==" : "&cong;",

	"<" : "&lt;",
	">" : "&gt;",
	"<=" : "&le;",
	">=" : "&ge;",
	
	":<:" : "&sub;",  // Subset // TODO: Not a subset
	":>:" : "&sup;",  // Superset
	":<=:" : "&sube;",
	":>=:" : "&supe;",

	":!<:" : "&nsub;",
	":¬<:" : "&nsub;",

	"_|_" : "&perp;",

	"(X)" : "&otimes;",
	"(+)" : "&oplus;",

	"->" : "&rarr;",  // This one has a shortform
	"-->" : "&rarr;",
	"<--" : "&larr;",
	"<->" : "&harr;",

	"==>" : "&rArr;",
	"<==" : "&lArr;",
	"<=>" : "&hArr;",

	// Not in HTML 4.0
	"o" : "&compfn;",

	"||" : "&par;",
	"|" : "&mid;",

	"~=" : "&sime;",
	"<<" : "&ll;",
	">>" : "&rr;",
	"<<<" : "&Ll;",
	">>>" : "&Rr;",

	"$$" : "&Int;",
	"$$$" : "&iiint;",
};

const maxOperatorKeyLength = 4;  // Actually only matters for the keys that start with a non-letter.

function isPostfix(op) {
	return op == "%" || op == "&prime;" || op == "&hellip;";
}

function writeIdentifier(nesting) {
	let isCapitalLetter = (this.identifier.length == 1 && this.identifier >= "A" && this.identifier <= "Z");
	let startTag = isCapitalLetter ? "<mi mathvariant=normal>" : "<mi>";
	return pad(startTag + this.identifier + "</mi>", nesting);
}

function isAlpha(c) {
	return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
}

function parseQuotedIdentifier(p) {
	// Any string in single-quotes becomes an identifier.
	// This is useful for non-ASCII identifiers.
	// alphanumeric character (like "x") is intended to be an identifier not an operator.

	// TODO: Allow an escaped quote character in the identifier

	if (matchString(p, "\'")) {
		let result = {"type": IDENTIFIER, "identifier": "", "write" : writeIdentifier};

		while(p.i < p.s.length && !matchString(p, "\'")) {
			result.identifier += p.s[p.i];
			++p.i;
		}

		return result;
	}

	return "";
}

function parseIdentifier(p) {
	let result = parseQuotedIdentifier(p);
	if (result) {
		return result;
	}

	result = {"type": IDENTIFIER, "identifier": "", "write" : writeIdentifier};

	if (p.i >= p.s.length) {
		return "";
	}

	if (isAlpha(p.s[p.i])) {
		let end = p.i + 1;
		while (end < p.s.length && isAlpha(p.s[end])) {
			++end;
		}

		let s = p.s.substring(p.i, end);

		if (s.length == 1) {
			result.identifier = s;
			p.i = end;
			return result;
		} else if (s in identifierDictionary) {
			result.identifier = identifierDictionary[s];
			p.i = end;
			return result;
		}
	} else {
		for (let i = maxIdentifierKeyLength; i > 0; --i) {
			if (p.i + i <= p.s.length) {
				let s = p.s.substring(p.i, p.i + i)
				if (s in identifierDictionary) {
					result.identifier = identifierDictionary[s];
					p.i += i;
					return result;
				}
			}
		}
	}

	return "";
}

function writeOperator(nesting) {
	if (this.operator == "&dd;") {
		// The MathML standard says this should look like a double-struck d.
		// I don't know anyone who wants it to look like that.
		return pad("<mspace width=thinmathspace /><mi>d</mi>", nesting);
	}

	return pad("<mo>" + this.operator + "</mo>", nesting);
}

function parseOperator(p) {
	let result = {"type": OPERATOR, "operator": "", "write": writeOperator};

	if (p.expectBracket && matchString(p, p.expectBracket)) {
		// We don't want to match the final bracket
		p.i -= p.expectBracket.length;  // Rewind
		return "";
	}

	if (p.i >= p.s.length) {
		return "";
	}

	if (isAlpha(p.s[p.i])) {
		let end = p.i + 1;
		while (end < p.s.length && isAlpha(p.s[end])) {
			++end;
		}

		let s = p.s.substring(p.i, end);

		if (s in operatorDictionary) {
			result.operator = operatorDictionary[s];
			p.i = end;
			return result;
		}
	} else {
		for (let i = maxOperatorKeyLength; i > 0; --i) {
			if (p.i + i <= p.s.length) {
				let s = p.s.substring(p.i, p.i + i)
				if (s in operatorDictionary) {
					p.i += i;
					result.operator = operatorDictionary[s];
					return result;
				}
			}
		}
	}

	return "";
}

function parseUnrecognized(p) {
	if (p.expectBracket && matchString(p, p.expectBracket)) {
		// We don't want to match the final bracket
		p.i -= p.expectBracket.length;  // Rewind
		return "";
	}

	// An unrecognized word or letter eventually ends up as an identifier
	if (p.i < p.s.length && isAlpha(p.s[p.i])) {
		let result = {"type": IDENTIFIER, "identifier": "", "write": writeIdentifier};

		let end = p.i + 1;
		while (end < p.s.length && isAlpha(p.s[end])) {
			++end;
		}

		result.identifier = p.s.substring(p.i, end);
		p.i = end;

		return result;
	}

	// Any other unknown character ends up as an operator.
	if (p.i < p.s.length) {
		let result = {"type": OPERATOR, "operator": "", "write": writeOperator};

		let c = p.s[p.i];
		if (c != " " && c != ";") {
			result.operator = p.s[p.i];
			++p.i;
			return result;
		}
	}

	return "";
}

function write(p, isDisplayStyle) {
	let result = "";

	if (isDisplayStyle) {
		result += pad("<math display=block>", 0);
	} else {
		result += pad("<math display=inline>", 0);
	}
	result += p.write(1);
	result += pad("</math>");

	return result;
}

function visitNodes(p, visitor) {
	visitor(p);
	if (p.children) {
		let children = p.children();
		for (child of children) {
			if (child) {
				visitNodes(child, visitor);
			}
		}
	}
}

function doLayout(p) {
	visitNodes(p, layoutSubscripts);
	visitNodes(p, layoutExponents);
	visitNodes(p, layoutRoots);
	visitNodes(p, layoutFractions);
}

function writeScripted(nesting) {
	if (this.base && this.subscript && this.superscript) {
		return pad("<msubsup>", nesting) +
			this.base.write(nesting + 1) +
			this.subscript.write(nesting + 1) +
			this.superscript.write(nesting + 1) +
			pad("</msubsup>", nesting);
	} else if (this.base && this.superscript) {
		return pad("<msup>", nesting) +
			this.base.write(nesting + 1) +
			this.superscript.write(nesting + 1) +
			pad("</msup>", nesting);
	} else if (this.base && this.subscript) {
		return pad("<msub>", nesting) +
			this.base.write(nesting + 1) +
			this.subscript.write(nesting + 1) +
			pad("</msub>", nesting);
	}
	return this.base.write(nesting);
}

function layoutSubscripts(p) {
	// The _ operator
	if ((p.type == CLUSTER) && p.elements.length >= 3) {
		let i = p.elements.length - 3;
		while (i >= 0) {
			if (i + 2 < p.elements.length && p.elements[i + 1].type == OPERATOR &&
					p.elements[i + 1].operator == "_")
			{
				let base = p.elements[i];
				let subscript = p.elements[i + 2];

				if (subscript.type == BRACKETED) {
					subscript = subscript.contents;
				}

				let scripted = {"type": SCRIPTED, "base": base, "subscript": subscript,
						"write": writeScripted,
						"children" : function(){return [this.base, this.subscript, this.superscript]} };

				p.elements.splice(i, 3, scripted);
			} else {
				--i;
			}
		}
	}

	if ((p.type == CLUSTER) && p.elements.length >= 2) {
		let i = p.elements.length - 2;
		while (i >= 0) {
			if (i + 1 < p.elements.length && p.elements[i].type == IDENTIFIER &&
					p.elements[i + 1].type == NUMBER)
			{
				let base = p.elements[i];
				let subscript = p.elements[i + 1];

				let scripted = {"type": SCRIPTED, "base": base, "subscript": subscript,
						"write": writeScripted,
						"children" : function(){return [this.base, this.subscript, this.superscript]} };

				p.elements.splice(i, 2, scripted);
			} else {
				--i;
			}
		}
	}
}

function layoutExponents(p) {
	if ((p.type == CLUSTER) && p.elements.length >= 3) {
		let i = p.elements.length - 3;
		while (i >= 0) {
			if (i + 2 < p.elements.length && p.elements[i + 1].type == OPERATOR &&
					p.elements[i + 1].operator == "^")
			{
				let base = p.elements[i];
				let superscript = p.elements[i + 2];

				if (superscript.type == BRACKETED) {
					superscript = superscript.contents;
				}

				if (base.type == SCRIPTED && !base.superscript) {
					base.superscript = superscript;
					p.elements.splice(i + 1, 2);
				} else {
					let scripted = {"type": SCRIPTED, "base": base, "superscript": superscript,
						"write": writeScripted,
						"children" : function(){return [this.base, this.subscript, this.superscript]} };
					p.elements.splice(i, 3, scripted);
				}
			} else {
				--i;
			}
		}
	}
}

function writeRoot(nesting) {
	let result;

	if (this.index) {
		result = pad("<mroot>", nesting) +
			this.radicand.write(nesting + 1) +
			this.index.write(nesting + 1) +
			pad("</mroot>", nesting);
	} else {
		result = pad("<msqrt>", nesting) +
			this.radicand.write(nesting + 1) +
			pad("</msqrt>", nesting);
	}
	return result;
}

function layoutRoots(p) {
	if ((p.type == CLUSTER || p.type == ROW) && p.elements.length >= 2) {
		let i = p.elements.length - 2;
		while (i >= 0) {
			if (i + 1 < p.elements.length && p.elements[i].type == OPERATOR &&
					p.elements[i].operator == "&radic;")
			{
				let radical = {"type": ROOT, "radicand": null, "index": null,
					"write": writeRoot, "children": function(){return [this.radicand, this.index]} };

				if (i + 2 == p.elements.length) {
					radical.radicand = p.elements[i + 1];
				} else {
					radical.radicand = {"type": CLUSTER, "elements": p.elements.slice(i + 1),
						"write": writeRow,
						"children": function(){return this.elements} };
				}

				if (radical.radicand.type == BRACKETED) {
					radical.radicand = radical.radicand.contents;
				}

				p.elements.splice(i, p.elements.length - i, radical);
			}
			--i;
		}
	}
}

function writeFraction(nesting) {
	return pad("<mfrac>", nesting) +
		this.numerator.write(nesting + 1) +
		this.denominator.write(nesting + 1) +
		pad("</mfrac>", nesting);
}

function layoutFractions(p) {
	if (p.type == CLUSTER && p.elements.length >= 3) {
		let i = 1;
		while (i + 1 < p.elements.length) {
			if (p.elements[i].type == OPERATOR && p.elements[i].operator == "/") {
				let frac = {"type": FRACTION, "numerator": null, denominator: null,
						"write": writeFraction,
						"children" : function(){return [this.numerator, this.denominator]} };


				if (i == 1) {
					frac.numerator = p.elements[0];
				} else {
					frac.numerator = {"type": CLUSTER, "elements": p.elements.slice(0, i),
						"write": writeRow,
						"children": function(){return this.elements} };
				}

				if (i + 2 == p.elements.length) {
					frac.denominator = p.elements[i + 1];
				} else {
					frac.denominator = {"type": CLUSTER, "elements": p.elements.slice(i + 1),
						"write": writeRow,
						"children": function(){return this.elements} };
				}

				if (frac.numerator.type == BRACKETED) {
					frac.numerator = frac.numerator.contents;
				}
				if (frac.denominator.type == BRACKETED) {
					frac.denominator = frac.denominator.contents;
				}

				p.elements.splice(0, p.elements.length, frac);
				break;
			} else {
				++i;
			}
		}
	} else if (p.type == ROW && p.elements.length >= 3) {
		let i = 0;
		while (i + 2 < p.elements.length) {
			if (p.elements[i + 1].type == OPERATOR && p.elements[i + 1].operator == "/") {
				let frac = {"type": FRACTION, "numerator": null, denominator: null,
						"write": writeFraction,
						"children" : function(){return [this.numerator, this.denominator]} };
				frac.numerator = p.elements[i];
				frac.denominator = p.elements[i + 2];

				if (frac.numerator.type == BRACKETED) {
					frac.numerator = frac.numerator.contents;
				}
				if (frac.denominator.type == BRACKETED) {
					frac.denominator = frac.denominator.contents;
				}

				p.elements.splice(i, 3, frac);
			} else {
				++i;
			}
		}
	}
}

function MightyMathMarkdown() {
	let nodeIterator = document.createNodeIterator(document.body, NodeFilter.SHOW_TEXT);
	let node;

	node = nodeIterator.nextNode();
	while (node) {
		let splits = node.textContent.split("###");
		if (splits.length <= 1) {
			node = nodeIterator.nextNode();
			continue;
		}

		let newNodes = [];

		for (let i = 0; i < splits.length; i += 2) {
			newNodes.push(document.createTextNode(splits[i]));
			if (i + 1 < splits.length) {
				let source = splits[i + 1];
				for (let block of source.split("\n\n")) {
					if (!block) {
						continue;
					}
					let div = document.createElement("div");
					div.innerHTML = toMathML(block, DISPLAY_STYLE);
					newNodes.push(div);
				}
			}
		}

		let oldNode = node;
		node = nodeIterator.nextNode();
		for (newNode of newNodes) {
			oldNode.parentNode.insertBefore(newNode, oldNode);
		}
		oldNode.textContent = "";
	}

	nodeIterator = document.createNodeIterator(document.body, NodeFilter.SHOW_TEXT);

	// TODO: Inline style
}

document.addEventListener("DOMContentLoaded", MightyMathMarkdown);
